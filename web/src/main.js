import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import { connect } from './storage.js';

createApp(App).mount('#app');
connect();
