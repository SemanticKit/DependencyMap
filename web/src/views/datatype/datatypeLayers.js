/* The views of the Datatype view. They are made as the views of the Class view are (see class/classLayers.js): a
   view is a selector and a part, a layer is one standard, and a term takes the nearest view above it in the files.
   Here a box is a datatype: an instance of rdfs:Datatype. */
export const DATATYPE_LAYERS = (() => {
  const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', rdfs = 'http://www.w3.org/2000/01/rdf-schema#';
  return [
    { standard: 'RDF and RDFS', views: [
      { select: { statement: rdf + 'type' }, part: 'instance' },
      { select: { statement: rdfs + 'subClassOf' }, part: 'inherits' },
      { select: { statement: rdfs + 'domain' }, part: 'memberOf' },
      { select: { statement: rdfs + 'range' }, part: 'memberType' },
      { select: { instanceOf: rdfs + 'Datatype' }, part: 'class' },
      { select: { instanceOf: rdf + 'Property' }, part: 'members' },
    ] },
  ];
})();
