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
  Q17278671 : { org: 'WHC'   , name: 'Tentative World Heritage Site', order: 402 },
  Q20905436 : { org: 'RAMSAR', name: 'Ramsar Site'                  , order: 501 },
  Q4654172  : { org: 'ASEAN' , name: 'ASEAN Heritage Park'          , order: 601 },
}
const SPARQL_QUERY =
`SELECT ?site ?siteLabel ?coord ?designation ?declared ?declaredPrecision
       ?declaration ?declarationTitle ?declarationScan ?declarationText
       ?partSite ?partSiteLabel ?image ?siteArticle WHERE {
  ?site p:P625 ?coordStatement .
  ?coordStatement ps:P625 ?coord .
  OPTIONAL {
    ?site wdt:P527 ?partSite .
    ?coordStatement pq:P518 ?coordPart .
    FILTER (?coordPart = ?partSite)
  }
  OPTIONAL { ?site wdt:P18 ?image }
  {
    ?site p:P1435 ?designationStatement .
    ?designationStatement ps:P1435 ?designation .
    ?site wdt:P1435 ?designation .
    FILTER (
      ?designation = wd:Q23677505 ||  # National Historical Landmark
      ?designation = wd:Q25927302 ||  # National Shrine
      ?designation = wd:Q36348834 ||  # National Monument
      ?designation = wd:Q40720162 ||  # Heritage Zone
      ?designation = wd:Q36352489 ||  # Heritage House
      ?designation = wd:Q24189292 ||  # National Cultural Treasure
      ?designation = wd:Q25036854 ||  # Important Cultural Property
      ?designation = wd:Q25927309     # National Geological Monument
    )
  }
  UNION
  {
    ?site p:P1435 ?designationStatement ;
          wdt:P17 wd:Q928 .
    ?designationStatement ps:P1435 ?designation .
    FILTER (
      ?designation = wd:Q9259     ||  # World Heritage Site
      ?designation = wd:Q17278671 ||  # tentative World Heritage Site
      ?designation = wd:Q20905436 ||  # Ramsar Site
      ?designation = wd:Q4654172      # ASEAN Heritage Park
    )
  }
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
  OPTIONAL {
    ?siteArticle schema:about ?site ;
                 schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
const SPARQL_QUERY_ESCAPED = escape(SPARQL_QUERY);
const WDQS_GUI_URL = 'https://query.wikidata.org/#' + SPARQL_QUERY_ESCAPED;

// Globals
var Sites = {};        // Hash to contain data about the heritage sites
var DbIndex;
