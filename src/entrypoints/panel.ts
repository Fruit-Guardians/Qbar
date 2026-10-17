import { createApp } from 'vue'
import App from '@/app/QBarApp.vue'
import disablePreventDefault from '@/app/plugins/disable-prevent-default'
import pinia from '@/app/plugins/pinia'
import vuetify from '@/app/plugins/vuetify'
import i18n from '@/shared/i18n'

// Styles
import '@/app/styles/vuetify.scss'
import '@/app/styles/panel.scss'

// Libs
import '@/features/tools/generators/encode.js'
import '@/features/tools/generators/hash.js'
import '@/features/tools/generators/payload.js'

createApp(App)
  .use(i18n, locale => {
    vuetify.locale.current.value = locale
  })
  .use(vuetify)
  .use(pinia)
  .use(disablePreventDefault)
  .mount('#app')
