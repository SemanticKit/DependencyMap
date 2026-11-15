/* The LDO shape type of a class, made at run time. The shape is ShEx, written from what the loaded ontologies say of
   the class: one constraint for each of its properties. LDO's own converter makes the context from the shape, so
   the names of the properties of the object are LDO's, not ours. */
import shexjToTyping from '@ldo/schema-converter-shex';

/* schema: a Schema. cls: the IRI of a class. Gives { shape, schema, context, members }; a member is one property
   of the class with the name LDO gave it: { name, iri, ranges, literal, single }. */
export async function shapeTypeOf(schema, cls) {
  const properties = schema.propertiesOf(cls);
  const shex = {
    type: 'Schema',
    shapes: [{
      id: cls,
      type: 'ShapeDecl',
      shapeExpr: {
        type: 'Shape',
        expression: {
          type: 'EachOf',
          expressions: properties.map(property => ({
            type: 'TripleConstraint',
            predicate: property.iri,
            valueExpr: { type: 'NodeConstraint', nodeKind: property.literal ? 'literal' : 'iri' },
            min: 0,
            max: property.single ? 1 : -1,
          })),
        },
      },
    }],
  };
  const [, context] = await shexjToTyping(shex);
  const members = [];
  for (const name of Object.keys(context)) {
    const property = properties.find(each => each.iri === context[name]['@id']);
    if (property) members.push({ name, ...property });
  }
  return { shape: cls, schema: shex, context: { ...context, type: { '@id': '@type', '@isCollection': true } }, members };
}
