/* The views of the Class view. A view is a selector and a part: the selector says what in the loaded files the view
   is for, and the part says what that becomes on the class diagram. The page knows the parts and the two selectors,
   and nothing of the terms.

   A layer is one standard, with the views it brings: RDF and RDFS first, then each standard built on them.

   The views are a hierarchy, the one the files themselves state. A selector matches the term it names and each term
   under it: under a class by rdfs:subClassOf, under a property by rdfs:subPropertyOf. Where several views match, the
   nearest one is used. So a standard states only what it changes: an owl:ObjectProperty is a member with no view of
   its own, because the files say it is under rdf:Property, and owl:FunctionalProperty has a view because it is to
   be shown differently.

   The selectors:
   - instanceOf: a term that is an instance of this term.
   - statement:  a statement with this property.

   The parts for instanceOf:
   - class:   a box.
   - members: a member of a class. The members with the same type are one part of the box, under that type as title.
   - mark:    this text after a member.
   - omit:    not on the diagram. A datatype is a class in the files, and it is left off: it is the type of a
              member, named after the member, and not a box of its own.
   The parts for statement:
   - instance:   says what a term is an instance of.
   - inherits:   the inheritance connection, from a class to the class above it.
   - memberOf:   says which class a member is in.
   - memberType: says the type of a member, shown after its name. */
export const CLASS_LAYERS = (() => {
  const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', rdfs = 'http://www.w3.org/2000/01/rdf-schema#',
    owl = 'http://www.w3.org/2002/07/owl#';
  return [
    { standard: 'RDF and RDFS', views: [
      { select: { statement: rdf + 'type' }, part: 'instance' },
      { select: { statement: rdfs + 'subClassOf' }, part: 'inherits' },
      { select: { statement: rdfs + 'domain' }, part: 'memberOf' },
      { select: { statement: rdfs + 'range' }, part: 'memberType' },
      { select: { instanceOf: rdfs + 'Class' }, part: 'class' },
      { select: { instanceOf: rdf + 'Property' }, part: 'members' },
      { select: { instanceOf: rdfs + 'Datatype' }, part: 'omit' },
    ] },
    { standard: 'OWL', views: [
      { select: { instanceOf: owl + 'FunctionalProperty' }, part: 'mark', text: '[0..1]' },
      { select: { instanceOf: owl + 'InverseFunctionalProperty' }, part: 'mark', text: '{inverse functional}' },
      { select: { instanceOf: owl + 'TransitiveProperty' }, part: 'mark', text: '{transitive}' },
      { select: { instanceOf: owl + 'SymmetricProperty' }, part: 'mark', text: '{symmetric}' },
      { select: { instanceOf: owl + 'AsymmetricProperty' }, part: 'mark', text: '{asymmetric}' },
      { select: { instanceOf: owl + 'ReflexiveProperty' }, part: 'mark', text: '{reflexive}' },
      { select: { instanceOf: owl + 'IrreflexiveProperty' }, part: 'mark', text: '{irreflexive}' },
    ] },
  ];
})();
