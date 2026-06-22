import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/App.vue';
import { router } from '@/router';
import { initServices } from '@/services/init';

const app = createApp(App);
app.use(createPinia());
app.use(router);
initServices();
app.mount('#app');
