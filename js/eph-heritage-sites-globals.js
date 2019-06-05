'use strict';

// Constants and fixed parameters
const BASE_TITLE = 'Heritage Sites Map – Encyclopedia of Philippine Heritage';
const ORGS = {
  NHCP   : 'National Historical Commission of the Philippines',
  NM     : 'National Museum',
  DENR   : 'Department of Environment and Natural Resources',
  WHC    : 'UNESCO World Heritage Committee',
  RAMSAR : 'Ramsar Convention',
  ASEAN  : 'ASEAN Center for Biodiversity',
}
const DESIGNATION_TYPES = {
  Q23677505 : { org: 'NHCP'  , name: 'National Historical Landmark' , order: 101 },
  Q36348834 : { org: 'NHCP'  , name: 'National Monument'            , order: 102 },
  Q25927302 : { org: 'NHCP'  , name: 'National Shrine'              , order: 103 },
  Q40720162 : { org: 'NHCP'  , name: 'Heritage Zone'                , order: 104 },
  Q36352489 : { org: 'NHCP'  , name: 'Heritage House'               , order: 105 },
  Q24189292 : { org: 'NM'    , name: 'National Cultural Treasure'   , order: 201 },
  Q25036854 : { org: 'NM'    , name: 'Important Cultural Property'  , order: 202 },
  Q25927309 : { org: 'DENR'  , name: 'National Geological Monument' , order: 301 },
  Q9259     : { org: 'WHC'   , name: 'World Heritage Site'          , order: 401 },
  Q43113623 : { partOf: 'Q9259' },
  Q17278671 : { org: 'WHC'   , name: 'Tentative World Heritage Site', order: 402 },
  Q20905436 : { org: 'RAMSAR', name: 'Ramsar Site'                  , order: 501 },
  Q4654172  : { org: 'ASEAN' , name: 'ASEAN Heritage Park'          , order: 601 },
}
const SPARQL_QUERY_0 =
`SELECT ?siteQid ?siteLabel ?designationQid WHERE {
  # National heritage site designations
  {
    ?site wdt:P1435 ?designation .
    FILTER ( ?designation IN (
      wd:Q23677505,  # National Historical Landmark
      wd:Q36348834,  # National Monument
      wd:Q25927302,  # National Shrine
      wd:Q40720162,  # Heritage Zone
      wd:Q36352489,  # Heritage House
      wd:Q24189292,  # National Cultural Treasure
      wd:Q25036854,  # Important Cultural Property
      wd:Q25927309   # National Geological Monument
    ))
  }
  UNION
  # International heritage site designations in the Philippines
  {
    ?site wdt:P1435 ?designation ; wdt:P17 wd:Q928 .
    FILTER ( ?designation IN (
      wd:Q9259,      # World Heritage Site
      wd:Q17278671,  # tentative World Heritage Site
      wd:Q43113623,  # part of World Heritage Site
      wd:Q20905436,  # Ramsar Site
      wd:Q4654172    # ASEAN Heritage Park
    ))
  }
  ?site rdfs:label ?siteLabel . FILTER(LANG(?siteLabel) = "en") .
  BIND (SUBSTR(STR(?site       ), 32) AS ?siteQid       ) .
  BIND (SUBSTR(STR(?designation), 32) AS ?designationQid) .
} ORDER BY ?siteLabel`;
const SPARQL_QUERY_1 =
`SELECT ?siteQid ?coord WHERE {
  <SPARQLVALUESCLAUSE>
  ?site p:P625 ?coordStatement .
  ?coordStatement ps:P625 ?coord .
  # Do not include coordinates for parts
  FILTER NOT EXISTS { ?coordStatement pq:P518 ?x }
  BIND (SUBSTR(STR(?site), 32) AS ?siteQid) .
}`;
//    ?site wdt:P527 ?sitePart .
const SPARQL_QUERY_2 =
`SELECT ?siteQid ?designationQid ?declared ?declaredPrecision
       ?declaration ?declarationTitle ?declarationScan ?declarationText WHERE {
  <SPARQLVALUESCLAUSE>
  ?site p:P1435 ?designationStatement .
  ?designationStatement ps:P1435 ?designation .
  FILTER ( ?designation IN (
    wd:Q23677505,  # National Historical Landmark
    wd:Q36348834,  # National Monument
    wd:Q25927302,  # National Shrine
    wd:Q40720162,  # Heritage Zone
    wd:Q36352489,  # Heritage House
    wd:Q24189292,  # National Cultural Treasure
    wd:Q25036854,  # Important Cultural Property
    wd:Q25927309,  # National Geological Monument
    wd:Q9259,      # World Heritage Site
    wd:Q17278671,  # tentative World Heritage Site
    wd:Q43113623,  # part of World Heritage Site
    wd:Q20905436,  # Ramsar Site
    wd:Q4654172    # ASEAN Heritage Park
  ))
  FILTER NOT EXISTS { ?designationStatement pqv:P582 ?endTime }
  OPTIONAL {
    ?designationStatement pqv:P580 ?declaredValue .
    ?declaredValue wikibase:timeValue ?declared ;
                   wikibase:timePrecision ?declaredPrecision .
  }
  OPTIONAL {
    ?designationStatement pq:P457 ?declaration .
    ?declaration wdt:P1476 ?declarationTitle .
    OPTIONAL { ?declaration wdt:P996 ?declarationScan }
    OPTIONAL {
      ?declarationText schema:about ?declaration ;
                       schema:isPartOf <https://en.wikisource.org/> .
    }
  }
  BIND (SUBSTR(STR(?site       ), 32) AS ?siteQid       ) .
  BIND (SUBSTR(STR(?designation), 32) AS ?designationQid) .
}`;
const SPARQL_QUERY_3 =
`SELECT ?siteQid ?image ?wikipediaUrlTitle WHERE {
  <SPARQLVALUESCLAUSE>
  OPTIONAL { ?site wdt:P18 ?image }
  OPTIONAL {
    ?wikipediaUrl schema:about ?site ;
                  schema:isPartOf <https://en.wikipedia.org/> .
  }
  BIND (SUBSTR(STR(?site        ), 32) AS ?siteQid          ) .
  BIND (SUBSTR(STR(?wikipediaUrl), 31) AS ?wikipediaUrlTitle) .
}`;
const ABOUT_SPARQL_QUERY =
`SELECT ?site ?siteLabel ?designationLabel ?declared ?declaration ?declarationTitle
       ?coord ?image ?wikipedia WHERE {
  # National heritage site designations
  {
    ?site p:P1435 ?designationStatement .
    ?designationStatement ps:P1435 ?designation .
    FILTER ( ?designation IN (
      wd:Q23677505,  # National Historical Landmark
      wd:Q36348834,  # National Monument
      wd:Q25927302,  # National Shrine
      wd:Q40720162,  # Heritage Zone
      wd:Q36352489,  # Heritage House
      wd:Q24189292,  # National Cultural Treasure
      wd:Q25036854,  # Important Cultural Property
      wd:Q25927309   # National Geological Monument
    ))
  }
  UNION
  # International heritage site designations in the Philippines
  {
    ?site wdt:P17 wd:Q928 .
    ?site p:P1435 ?designationStatement .
    ?designationStatement ps:P1435 ?designation .
    FILTER ( ?designation IN (
      wd:Q9259,      # World Heritage Site
      wd:Q17278671,  # tentative World Heritage Site
      wd:Q43113623,  # part of World Heritage Site
      wd:Q20905436,  # Ramsar Site
      wd:Q4654172    # ASEAN Heritage Park
    ))
  }
  FILTER NOT EXISTS { ?designationStatement pqv:P582 ?endTime }
  OPTIONAL { ?designationStatement pq:P580 ?declared }
  OPTIONAL {
    ?designationStatement pq:P457 ?declaration .
    ?declaration wdt:P1476 ?declarationTitle .
  }
  OPTIONAL {
    ?site p:P625 ?coordStatement .
    ?coordStatement ps:P625 ?coord .
    # Do not include coordinates for parts
    FILTER NOT EXISTS { ?coordStatement pq:P518 ?x }
  }
  OPTIONAL { ?site wdt:P18 ?image }
  OPTIONAL {
    ?wikipedia schema:about ?site ;
               schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}`;

// Globals
var DesignationIndex;  // Index of designation types
