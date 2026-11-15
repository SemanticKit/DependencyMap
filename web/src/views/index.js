/* The views of the map, in the order of their buttons. Each view is one component in its own file. To add a view,
   write its component and add its line here.
   - byType: the view shows the terms of one type, so the Type box is shown with it.
   - chart: the view is one drawing that takes the whole panel. */
import TiersView from './TiersView.vue';
import OnionView from './OnionView.vue';
import TreemapView from './TreemapView.vue';
import PackView from './PackView.vue';
import TreeView from './TreeView.vue';
import ClusterView from './ClusterView.vue';
import ClassView from './ClassView.vue';
import DatatypeView from './DatatypeView.vue';

export const views = [
  { id: 'tiers', name: 'Tiers', component: TiersView },
  { id: 'onion', name: 'Onion', component: OnionView, chart: true, byType: true },
  { id: 'treemap', name: 'Treemap', component: TreemapView, chart: true, byType: true },
  { id: 'pack', name: 'Pack', component: PackView, chart: true, byType: true },
  { id: 'tree', name: 'Tree', component: TreeView, chart: true, byType: true },
  { id: 'cluster', name: 'Cluster', component: ClusterView, chart: true, byType: true },
  { id: 'class', name: 'Class', component: ClassView, chart: true },
  { id: 'datatype', name: 'Datatype', component: DatatypeView, chart: true },
];
/* the view that is on: the one the Layout buttons picked, or the first */
export const viewOf = id => views.find(v => v.id === id) || views[0];
