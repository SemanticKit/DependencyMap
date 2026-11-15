/* The views of a term, in the order of their tabs: one for each standard. Each is a component in the folder of its
   standard, given the id of the term. There is one for now: RDF. A view for another standard, such as OWL, is added
   by writing it in its own folder and adding its line here. */
import RdfView from '../rdf/RdfView.vue';

export const termViews = [
  { id: 'rdf', name: 'RDF', component: RdfView },
];

/* the view whose tab is on: the one with this id, or the first */
export function currentOf(id) {
  return termViews.find(view => view.id === id) || termViews[0];
}
