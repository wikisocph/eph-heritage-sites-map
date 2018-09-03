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
const NL = '\n';
const SPARQL_QUERY =
'SELECT ?site ?siteLabel ?coord ?designation ?declared ?declaredPrecision' + NL +
'       ?declaration ?declarationTitle ?declarationScan ?declarationText' + NL +
'       ?partSite ?partSiteLabel ?image ?siteArticle WHERE {' + NL +
'  ?site p:P625 ?coordStatement .' + NL +
'  ?coordStatement ps:P625 ?coord .' + NL +
'  OPTIONAL {' + NL +
'    ?site wdt:P527 ?partSite .' + NL +
'    ?coordStatement pq:P518 ?coordPart .' + NL +
'    FILTER (?coordPart = ?partSite)' + NL +
'  }' + NL +
'  OPTIONAL { ?site wdt:P18 ?image }' + NL +
'  {' + NL +
'    ?site p:P1435 ?designationStatement .' + NL +
'    ?designationStatement ps:P1435 ?designation .' + NL +
'    ?site wdt:P1435 ?designation .' + NL +
'    FILTER (' + NL +
'      ?designation = wd:Q23677505 ||  # National Historical Landmark' + NL +
'      ?designation = wd:Q25927302 ||  # National Shrine' + NL +
'      ?designation = wd:Q36348834 ||  # National Monument' + NL +
'      ?designation = wd:Q40720162 ||  # Heritage Zone' + NL +
'      ?designation = wd:Q36352489 ||  # Heritage House' + NL +
'      ?designation = wd:Q24189292 ||  # National Cultural Treasure' + NL +
'      ?designation = wd:Q25036854 ||  # Important Cultural Property' + NL +
'      ?designation = wd:Q25927309     # National Geological Monument' + NL +
'    )' + NL +
'  }' + NL +
'  UNION' + NL +
'  {' + NL +
'    ?site p:P1435 ?designationStatement ;' + NL +
'          wdt:P17 wd:Q928 .' + NL +
'    ?designationStatement ps:P1435 ?designation .' + NL +
'    FILTER (' + NL +
'      ?designation = wd:Q9259     ||  # World Heritage Site' + NL +
'      ?designation = wd:Q17278671 ||  # tentative World Heritage Site' + NL +
'      ?designation = wd:Q20905436 ||  # Ramsar Site' + NL +
'      ?designation = wd:Q4654172      # ASEAN Heritage Park' + NL +
'    )' + NL +
'  }' + NL +
'  OPTIONAL {' + NL +
'    ?designationStatement pqv:P580 ?declaredValue .' + NL +
'    ?declaredValue wikibase:timeValue ?declared ;' + NL +
'                   wikibase:timePrecision ?declaredPrecision .' + NL +
'  }' + NL +
'  OPTIONAL {' + NL +
'    ?designationStatement pq:P457 ?declaration .' + NL +
'    ?declaration wdt:P1476 ?declarationTitle .' + NL +
'    OPTIONAL { ?declaration wdt:P996 ?declarationScan }' + NL +
'    OPTIONAL {' + NL +
'      ?declarationText schema:about ?declaration ;' + NL +
'                       schema:isPartOf <https://en.wikisource.org/> .' + NL +
'    }' + NL +
'  }' + NL +
'  OPTIONAL {' + NL +
'    ?siteArticle schema:about ?site ;' + NL +
'                 schema:isPartOf <https://en.wikipedia.org/> .' + NL +
'  }' + NL +
'  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }' + NL +
'}';
const SPARQL_QUERY_ESCAPED = escape(SPARQL_QUERY);
const WDQS_GUI_URL = 'https://query.wikidata.org/#' + SPARQL_QUERY_ESCAPED;

// Globals
var Sites = {};        // Hash to contain data about the heritage sites
var DbIndex;
