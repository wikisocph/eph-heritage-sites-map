'use strict';


// This is the AJAX event handler for the Wikidata query and
// also completes the app initialization.
function processWikidataQuery() {

  if (this.readyState !== this.DONE || this.status !== 200) return;

  var data = JSON.parse(this.responseText);

  // Go through each query result and populate the Sites database
  data.results.bindings.forEach(function(result) {
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
  Object.keys(Sites).forEach(function(qid) { postProcessRecord(qid) });

  // If there is a permalinked site, re-initialize the map view
  let fragment = window.location.hash.replace('#', '');
  if (fragment in Sites) {
    let record = Sites[fragment];
    Map.setView([record.lat, record.lon], TILE_LAYER_MAX_ZOOM);
  }

  generateDbIndex();
  generateFilter();
  document.querySelector('#filter select').dispatchEvent(new Event('change'));

  enableApp();
}


// This takes a query result and its corresponding record and updates that
// record with any new data provided in the result.
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
      parseDate(result, 'declared', partDesignation);
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
    parseDate(result, 'declared', designation);
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


// This takes a heritage site QID then cleans up the corresponding record,
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
  li.innerHTML = '<a href="#' + qid + '">' + record.title + '</a>';
  record.indexLi = li;
}


// TODO: Documentation
function generateDbIndex() {

  // Declare index with 1 entry
  DbIndex = { all: new DbIndexEntry };

  // Create index entries
  Object.keys(DESIGNATION_TYPES).forEach(function(typeQid) {
    DbIndex[typeQid] = new DbIndexEntry;
    let orgId = DESIGNATION_TYPES[typeQid].org;
    if (!(orgId in DbIndex)) DbIndex[orgId] = new DbIndexEntry;
  });

  // Populate index entries
  Object.keys(Sites)
    .map(function(siteQid) { return Sites[siteQid] })
    .forEach(function(record) {
      DbIndex.all.total++;
      if (record.mapMarker) DbIndex.all.mapMarkers.push(record.mapMarker);
      DbIndex.all.indexLis  .push(record.indexLi);
      Object.keys(record.designations).forEach(function(typeQid) {
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
    }
  );

  // Sort list items for panel index
  Object.keys(DbIndex).forEach(function(key) {
    DbIndex[key].indexLis = DbIndex[key].indexLis
      .map(function(li) { return { sortKey: li.textContent, item: li } })
      .sort(function(a, b) { return a.sortKey > b.sortKey ? 1 : -1 })
      .map(function(dict) { return dict.item });
  });
}


// TODO: Documentation
function generateFilter() {

  let select = document.querySelector('#filter select');

  // Populate the select element
  select.options[0].textContent += DbIndex.all.total;
  let optgroup;
  Object.keys(DESIGNATION_TYPES)
    .map(function(qid) { return { sortKey: DESIGNATION_TYPES[qid].order, item: qid } })
    .sort(function(a, b) { return a.sortKey - b.sortKey })
    .map(function(dict) { return dict.item })
    .forEach(function(qid) {
      if (DESIGNATION_TYPES[qid].order % 100 === 1) {
        optgroup = document.createElement('optgroup');
        optgroup.label = ORGS[DESIGNATION_TYPES[qid].org];
        select.appendChild(optgroup);
      }
      let option = document.createElement('option');
      option.value = qid;
      option.textContent = DESIGNATION_TYPES[qid].name + ' – ' + DbIndex[qid].total;
      optgroup.appendChild(option);
    }
  );

  // Add event handler to activate the filtering
  select.addEventListener('change', function(el) {
    let qid = select.options[select.selectedIndex].value;
    Cluster.clearLayers();
    Cluster.addLayers(DbIndex[qid].mapMarkers);
    if (AppIsInitialized) Map.fitBounds(Cluster.getBounds());
    let ol = document.getElementById('index-list');
    ol.innerHTML = '';
    DbIndex[qid].indexLis.forEach(function(li) { ol.appendChild(li) });
    select.blur();
  });
}


// TODO
function processFragment(fragment) {
  if (!(fragment in Sites)) return false;
  activateSite(fragment);
  return true;
}


// This takes a heritage site QID and updates the map to show the
// corresponding map marker, opens its popup if it isn't open yet, and
// displays the site's details on the side panel.
function activateSite(qid) {
  displayRecordDetails(qid);
  let record = Sites[qid];
  if (record.isCompound) {
    // TODO: enhance in the future to show all sites
  }
  else {
    Cluster.zoomToShowLayer(record.mapMarker, function() {
      Map.setView([record.lat, record.lon], Map.getZoom());
      if (!record.popup.isOpen()) {
        record.mapMarker.openPopup();
      }
    });
  }
}


// This function displays the heritage site's details on the side panel.
function displayRecordDetails(qid) {
  // TODO: Fix double-calling of this function

  let record = Sites[qid];

  window.location.hash = '#' + qid;
  document.title = record.title + ' – ' + BASE_TITLE;

  if (!record.panelElem) generateSiteDetails(qid, record);
  displayPanelContent('details');
  let detailsElem = document.querySelector('#details');
  detailsElem.replaceChild(record.panelElem, detailsElem.childNodes[0]);

  queryOsm(qid);
}


// This generates the details content of a heritage site for the side panel.
function generateSiteDetails(qid, record) {

  let titleHtml = '<h1>' + record.title + '</h1>';

  let figureHtml = '';
  if (record.imageFilename) {
    figureHtml = '<figure><div class="loader"></div></figure>';
  }
  else {
    figureHtml = '<figure class="nodata">No photo available</figure>';
  }

  let articleHtml;
  if (record.articleTitle) {
    articleHtml = '<div class="article main-text loading"><div class="loader"></div></div>';
  }
  else {
    articleHtml = '<div class="article main-text nodata"><p>This historical site has no Wikipedia article.</p></div>';
  }

  let designationsHtml = '<h2>Designations</h2><ul class="designations">';
  Object.keys(record.designations)
    .map(function(qid) { return { sortKey: DESIGNATION_TYPES[qid].order, item: qid } })
    .sort(function(a, b) { return a.sortKey - b.sortKey })
    .map(function(dict) { return dict.item })
    .forEach(function(designationQid) {
      let type = DESIGNATION_TYPES[designationQid];
      let designation = record.designations[designationQid];
      let declarationHtml = '';
      if (designation.declarationData) {
        declarationHtml = '<p>Declaration – <i>' + designation.declarationTitle + '</i>';
        declarationHtml += designation.date ? '; approved ' + designation.date : '';
        declarationHtml += '</p>';
        declarationHtml += '<div class="wikilinks">';
        declarationHtml += '<p><a href="' + designation.declarationData + '" title="">';
        declarationHtml += '<img src="img/wikidata_tiny_logo.png" alt="" />';
        declarationHtml += '<span>View details in Wikidata</span></a></p>';
        if (designation.declarationText) {
          declarationHtml += '<p><a href="' + designation.declarationText + '" title="">';
          declarationHtml += '<img src="img/wikisource_tiny_logo.png" alt="" />';
          declarationHtml += '<span>Read declaration text on Wikisource</span></a></p>';
        }
        if (designation.declarationScan) {
          declarationHtml += '<p><a href="' + designation.declarationScan + '" title="">';
          declarationHtml += '<img src="img/wikicommons_tiny_logo.png" alt="" />';
          declarationHtml += '<span>View scanned declaration in Wikimedia Commons</span></a></p>';
        }
        declarationHtml += '</div>';
      }
      else {
        if (designation.date) declarationHtml = '<p>Declared – ' + designation.date + '</p>';
      }
      designationsHtml += '<li><h3>' + type.name + '</h3><div class="org">';
      designationsHtml += '<img src="img/org_logo_' + type.org.toLowerCase() + '.svg">';
      designationsHtml += ORGS[type.org] + '</div>' + declarationHtml + '</li>';
    }
  );
  designationsHtml += '</ul>';

  let detailsHtml =
    '<a class="main-wikidata-link" href="https://www.wikidata.org/wiki/' + qid + '" title="View in Wikidata">' +
    '<img src="img/wikidata_tiny_logo.png" alt="[view Wikidata item]" /></a>' +
    titleHtml +
    figureHtml +
    articleHtml +
    designationsHtml;

  let panelElem = document.createElement('div');
  panelElem.innerHTML = detailsHtml;
  record.panelElem = panelElem;

  // Load lazy content
  if (record.imageFilename) displayFigure(record.imageFilename, panelElem.querySelector('figure'));
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
      elem.innerHTML = html +
        '<p class="wikipedia-link">' +
        '<a href="https://en.wikipedia.org/wiki/' + escape(title) + '">' +
        '<img src="img/wikipedia_tiny_logo.png" alt="" /><span>Read more on Wikipedia</span></a></p>';
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
        data: '[out:json][timeout:25];(way["wikidata"="' + qid + '"];relation["wikidata"="' + qid + '"];);out body;>;out skel qt;',
      },
      function(data) {
        let geoJson = osmtogeojson(data);
        if (!geoJson || geoJson.features.length === 0) return;
        let shapeLayer = L.geoJSON(geoJson, {
          style: {
            color     : '#ff3333',
            opacity   : 0.7,
            fill      : true,
          }
        });
        Sites[qid].shapeLayer = shapeLayer;
        shapeLayer.addTo(Map);
        Map.fitBounds(shapeLayer.getBounds());
      },
      'jsonp'
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
