import { createApp } from 'vue';
import { App } from './App';
import { dynamicMfeLoader } from './utils/dynamicMfeLoader';

const app = createApp(App);

// Host loads two MFEs at runtime by name.
// Static analysis can't see these as imports without help.
dynamicMfeLoader('users').then((mfe) => mfe.mount(document.body));
dynamicMfeLoader('products').then((mfe) => mfe.mount(document.body));

app.mount('#app');
