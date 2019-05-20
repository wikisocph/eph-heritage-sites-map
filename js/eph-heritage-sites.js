'use strict';


function loadPrimaryData() {
  let xhrObject = new XMLHttpRequest();
  xhrObject.onreadystatechange = processWikidataQuery;
  xhrObject.open('POST', WDQS_API_URL, true);
  xhrObject.overrideMimeType('text/plain');
  xhrObject.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
  xhrObject.send('format=json&query=' + SPARQL_QUERY_ESCAPED);
}


// Event handler that handles the AJAX for the Wikidata query and
// also completes the app initialization.
function processWikidataQuery() {

  if (this.readyState !== this.DONE || this.status !== 200) return;

  var data = JSON.parse(this.responseText);

  // Go through each query result and populate the Sites database
  data.results.bindings.forEach(result => {
    let qid = getQid(result.site);
    if (!(qid in Sites)) {
      if ('partSite' in result) {
        Sites[qid] = new CompoundSiteRecord;
      }
      else {
        Sites[qid] = new SiteRecord;
      }
    }
    let record = Sites[qid];
    processQueryResult(result, record);
  });

  // Do post-processing
  Object.keys(Sites).forEach(qid => { postProcessRecord(qid) });

  // If there is a permalinked site, re-initialize the map view
  let fragment = window.location.hash.replace('#', '');
  if (fragment in Sites) {
    let record = Sites[fragment];
    Map.setView([record.lat, record.lon], TILE_LAYER_MAX_ZOOM);
  }

  generateDbIndex();
  generateFilter();
  document.querySelector('#filter select').dispatchEvent(new Event('change'));

  // Add Wikidata Query Service GUI URL
  let anchorElem = document.getElementById('wdqs-link');
  anchorElem.href = WDQS_GUI_URL;

  enableApp();
}


// Given a query result and its corresponding record,
// updates that record with any new data provided in the result.
function processQueryResult(result, record) {

  if ('siteLabel' in result && result.siteLabel.value) {
    record.title = result.siteLabel.value;
  }
  else {
    record.title = null;
  }

  let designationQid = getQid(result.designation);

  let wktBits = result.coord.value.split(/\(|\)| /);  // Note: format is Point WKT
  if (record.isCompound) {

    let partQid = getQid(result.partSite);
    record.parts.push(partQid);

    let partRecord;
    if (partQid in Sites) {
      partRecord = Sites[partQid];
    }
    else {
      partRecord = new SiteRecord;
      Sites[partQid] = partRecord;
      partRecord.title = result.partSiteLabel.value || result.siteLabel.value;
      partRecord.lat = parseFloat(wktBits[2]);
      partRecord.lon = parseFloat(wktBits[1]);
    }

    let partDesignation;
    if (designationQid in partRecord.designations) {
      partDesignation = partRecord.designations[designationQid];
    }
    else {
      partDesignation = new Designation();
      partRecord.designations[designationQid] = partDesignation;
    }
    partDesignation.partOfQid = getQid(result.site);
    if ('declared' in result) {
      partDesignation.date = parseDate(result, 'declared');
    }
  }
  else {
    record.lat = parseFloat(wktBits[2]);
    record.lon = parseFloat(wktBits[1]);
  }

  let designation;
  if (designationQid in record.designations) {
    designation = record.designations[designationQid];
  }
  else {
    designation = new Designation();
    record.designations[designationQid] = designation;
  }

  if (!designation.date && 'declared' in result) {
    designation.date = parseDate(result, 'declared');
  }
  if (!designation.declarationData && 'declaration' in result) {
    designation.declarationData = result.declaration.value;
    designation.declarationTitle = result.declarationTitle.value;
    if ('declarationScan' in result) designation.declarationScan = result.declarationScan.value.replace(/Special:FilePath\//, 'File:');
    if ('declarationText' in result) designation.declarationText = result.declarationText.value;
  }

  if ('image' in result) {
    record.imageFilename = extractImageFilename(result.image);
  }

  if ('siteArticle' in result) {
    record.articleTitle = unescape(result.siteArticle.value).replace('https://en.wikipedia.org/wiki/', '');
  }
}


// Given a heritage site QID, cleans up the corresponding record,
// and generates a map marker and index entry for the heritage site.
function postProcessRecord(qid) {

  let record = Sites[qid];

  // Clean up record

  // Create a map marker and add to the cluster
  if (!record.isCompound) {
    let mapMarker = L.marker([record.lat, record.lon], {
      icon: L.ExtraMarkers.icon({ icon: '', markerColor : 'orange-dark' })
    });
    mapMarker.bindPopup(record.title, { closeButton: false });
    Cluster.addLayer(mapMarker);
    record.mapMarker = mapMarker;
    let popup = mapMarker.getPopup();
    popup._qid = qid;
    record.popup = popup;
  }

  // Create an index entry and add to the index
  let li = document.createElement('li');
  li.innerHTML = `<a href="#${qid}">${record.title}</a>`;
  record.indexLi = li;
}


// TODO: Documentation
function generateDbIndex() {

  // Declare index with 1 entry
  DbIndex = { all: new DbIndexEntry };

  // Create index entries
  Object.keys(DESIGNATION_TYPES).forEach(typeQid => {
    DbIndex[typeQid] = new DbIndexEntry;
    let orgId = DESIGNATION_TYPES[typeQid].org;
    if (!(orgId in DbIndex)) DbIndex[orgId] = new DbIndexEntry;
  });

  // Populate index entries
  Object.keys(Sites)
  .map(siteQid => Sites[siteQid])
  .forEach(record => {
    DbIndex.all.total++;
    if (record.mapMarker) DbIndex.all.mapMarkers.push(record.mapMarker);
    DbIndex.all.indexLis  .push(record.indexLi);
    Object.keys(record.designations).forEach(typeQid => {
      let orgId = DESIGNATION_TYPES[typeQid].org;
      DbIndex[typeQid].total++;
      DbIndex[orgId].total++;
      if (record.mapMarker) {
        DbIndex[typeQid].mapMarkers.push(record.mapMarker);
        DbIndex[orgId].mapMarkers.push(record.mapMarker);
      }
      DbIndex[typeQid].indexLis  .push(record.indexLi);
      DbIndex[orgId].indexLis  .push(record.indexLi);
    });
  });

  // Sort list items for panel index (using Schwartzian transform)
  Object.keys(DbIndex).forEach(key => {
    DbIndex[key].indexLis = DbIndex[key].indexLis
    .map(li => [li, li.textContent])
    .sort((a, b) => a[1] > b[1] ? 1 : -1)
    .map(item => item[0]);
  });
}


// TODO: Documentation
function generateFilter() {

  let select = document.querySelector('#filter select');

  // Populate the select element
  select.options[0].textContent += DbIndex.all.total;
  let optgroup;
  Object.keys(DESIGNATION_TYPES)
  .map(qid => [qid, DESIGNATION_TYPES[qid].order])  // Schwartzian transform
  .sort((a, b) => a[1] - b[1])
  .map(item => item[0])
  .forEach(qid => {
    let type = DESIGNATION_TYPES[qid];
    if (type.order % 100 === 1) {
      optgroup = document.createElement('optgroup');
      optgroup.label = ORGS[type.org];
      select.appendChild(optgroup);
    }
    let option = document.createElement('option');
    option.value = qid;
    option.textContent = type.name + ' – ' + DbIndex[qid].total;
    optgroup.appendChild(option);
  });

  // Add event handler to activate the filtering
  select.addEventListener('change', el => {
    let qid = select.options[select.selectedIndex].value;
    Cluster.clearLayers();
    Cluster.addLayers(DbIndex[qid].mapMarkers);
    if (AppIsInitialized) Map.fitBounds(Cluster.getBounds());
    let ol = document.getElementById('index-list');
    ol.innerHTML = '';
    DbIndex[qid].indexLis.forEach(li => { ol.appendChild(li) });
    select.blur();
  });
}


// Given a URL fragment, checks if it is the QID of a valid heritage site
// and activates the display of that site if so.
// Returns true if the fragment is valid and false otherwise.
function processFragment(fragment) {
  if (!(fragment in Sites)) return false;
  activateSite(fragment);
  return true;
}


// Given a heritage site QID, updates the map to show the corresponding
// map marker, opens its popup if it isn't open yet, and displays the heritage
// site's details on the side panel.
function activateSite(qid) {
  displayRecordDetails(qid);
  let record = Sites[qid];
  if (record.isCompound) {
    // TODO: enhance in the future to show all sites
  }
  else {
    Cluster.zoomToShowLayer(
      record.mapMarker,
      function() {
        Map.setView([record.lat, record.lon], Map.getZoom());
        if (!record.popup.isOpen()) record.mapMarker.openPopup();
      },
    );
  }
}


// Displays the heritage site's details on the side panel.
function displayRecordDetails(qid) {
  // TODO: Fix double-calling of this function

  let record = Sites[qid];

  // Set URL hash and window title
  window.location.hash = '#' + qid;
  document.title = record.title + ' – ' + BASE_TITLE;

  // Update panel
  if (!record.panelElem) generateSiteDetails(qid, record);
  displayPanelContent('details');
  let detailsElem = document.querySelector('#details');
  detailsElem.replaceChild(record.panelElem, detailsElem.childNodes[0]);

  queryOsm(qid);
}


// Generates the details content of a heritage site for the side panel.
function generateSiteDetails(qid, record) {

  let titleHtml = `<h1>${record.title}</h1>`;

  let figureHtml = generateFigure(record.imageFilename);

  let articleHtml;
  if (record.articleTitle) {
    articleHtml = '<div class="article main-text loading"><div class="loader"></div></div>';
  }
  else {
    articleHtml = '<div class="article main-text nodata"><p>This heritage site has no Wikipedia article yet.</p></div>';
  }

  let designationsHtml = '<h2>Designations</h2><ul class="designations">';
  Object.keys(record.designations)
  .map(qid => [qid, DESIGNATION_TYPES[qid].order])  // Schwartzian transform
  .sort((a, b) => a[1] - b[1])
  .map(item => item[0])
  .forEach(designationQid => {

    let type = DESIGNATION_TYPES[designationQid];
    let designation = record.designations[designationQid];

    let declarationHtml = '';
    if (designation.declarationData) {
      declarationHtml =
        `<p>Declaration – <i>${designation.declarationTitle}</i>` +
        (designation.date ? '; approved ' + designation.date : '') +
        '</p>' +
        '<div class="wikilinks">' +
          '<p>' +
            `<a href="${designation.declarationData}" title="">` +
              '<img src="img/wikidata_tiny_logo.png" alt="">' +
              '<span>View details in Wikidata</span>' +
            '</a>' +
          '</p>';
      if (designation.declarationText) declarationHtml +=
        '<p>' +
          `<a href="${designation.declarationText}" title="">` +
            '<img src="img/wikisource_tiny_logo.png" alt="">' +
            '<span>Read declaration text on Wikisource</span>' +
          '</a>' +
        '</p>';
      if (designation.declarationScan) declarationHtml +=
        '<p>' +
          `<a href="${designation.declarationScan}" title="">` +
            '<img src="img/wikicommons_tiny_logo.png" alt="">' +
            '<span>View scanned declaration in Wikimedia Commons</span>' +
          '</a>' +
        '</p>';
      declarationHtml += '</div>';
    }
    else {
      if (designation.date) declarationHtml = `<p>Declared – ${designation.date}</p>`;
    }

    designationsHtml +=
      '<li>' +
        `<h3>${type.name}</h3>` +
        '<div class="org">' +
          `<img src="img/org_logo_${type.org.toLowerCase()}.svg">` +
          ORGS[type.org] +
        '</div>' +
        declarationHtml +
      '</li>';
  });
  designationsHtml += '</ul>';

  let detailsHtml =
    `<a class="main-wikidata-link" href="https://www.wikidata.org/wiki/${qid}" title="View in Wikidata">` +
    '<img src="img/wikidata_tiny_logo.png" alt="[view Wikidata item]" /></a>' +
    titleHtml +
    figureHtml +
    articleHtml +
    designationsHtml;

  let panelElem = document.createElement('div');
  panelElem.innerHTML = detailsHtml;
  record.panelElem = panelElem;

  // Lazy load Wikipedia article extract
  if (record.articleTitle) displayArticleExtract(record.articleTitle, panelElem.querySelector('.article'));
}


// This takes an English Wikipedia article title and a div element and retrieves
// an extract of the article and places it into the element.
function displayArticleExtract(title, elem) {
  loadJsonp(
    'https://en.wikipedia.org/w/api.php',
    {
      action    : 'query',
      format    : 'json',
      prop      : 'extracts',
      exintro   : 1,
      redirects : true,
      titles    : title,
    },
    function(data) {
      let pageId = Object.keys(data.query.pages)[0];
      let html = data.query.pages[pageId].extract.match(/<p[^]+?<\/p>/)[0];
      elem.innerHTML =
        html +
        '<p class="wikipedia-link">' +
          `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(title)}">` +
            '<img src="img/wikipedia_tiny_logo.png" alt="" />' +
            '<span>Read more on Wikipedia</span>' +
          '</a>' +
        '</p>';
      elem.classList.remove('loading');
    }
  );
}


// TODO
function queryOsm(qid) {
  if (Sites[qid].shapeLayer !== undefined) {
    if (Sites[qid].shapeLayer) {
      Map.fitBounds(Sites[qid].shapeLayer.getBounds());
    }
  }
  else {
    Sites[qid].shapeLayer = null;
    loadJsonp(
      'https://overpass-api.de/api/interpreter',
      {
        data: `[out:json][timeout:25];(way["wikidata"="${qid}"];relation["wikidata"="${qid}"];);out body;>;out skel qt;`,
      },
      function(data) {
        let geoJson = osmtogeojson(data);
        if (!geoJson || geoJson.features.length === 0) return;
        let shapeLayer = L.geoJSON(
          geoJson,
          {
            style: {
              color     : '#ff3333',
              opacity   : 0.7,
              fill      : true,
            },
          },
        );
        Sites[qid].shapeLayer = shapeLayer;
        shapeLayer.addTo(Map);
        Map.fitBounds(shapeLayer.getBounds());
      },
      'jsonp',
    )
  }
}

// ------------------------------------------------------------

// Class declaration for representing a site's heritage designation
function Designation() {
  this.date             = undefined;
  this.declarationData  = undefined;
  this.declarationTitle = undefined;
  this.declarationScan  = undefined;
  this.declarationText  = undefined;
  this.partOfQid        = null;
  // TODO: add links to external info about the designation such as
  // the WHS page or the resolution that created the designation
}

// TODO:
function DbIndexEntry() {
  this.total      = 0;
  this.mapMarkers = [];
  this.indexLis   = [];
}

// Class declaration for representing an individual heritage site
function SiteRecord() {
  this.isCompound    = false;
  this.title         = '';
  this.imageFilename = '';
  this.articleTitle  = '';
  this.designations  = {};
  this.panelElem     = undefined;
  this.indexLi       = undefined;
  this.lat           = 0;
  this.lon           = 0;
  this.location      = '';
  this.mapMarker     = undefined;
  this.popup         = undefined;
  this.shapeLayer    = undefined;
}

// Class declaration for representing an compound heritage site
function CompoundSiteRecord() {
  this.isCompound    = true;
  this.title         = '';
  this.parts         = [];
  this.imageFilename = '';
  this.articleTitle  = '';
  this.designations  = {};
  this.panelElem     = undefined;
  this.indexLi       = undefined;
}
