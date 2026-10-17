// Styles
import 'vuetify/styles'

// Vuetify
import { createVuetify } from 'vuetify'
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg'
import { en, zhHans } from 'vuetify/locale'

export default createVuetify({
  locale: {
    locale: 'en',
    fallback: 'en',
    messages: {
      en,
      'zh-CN': {
        ...zhHans,
        open: '展开',
        dismiss: '收起',
        confirmEdit: { ok: '确定', cancel: '取消' },
        input: {
          ...zhHans.input,
          clear: '清除 {0}',
          prependAction: '{0} 前置操作',
          appendAction: '{0} 后置操作',
        },
      },
    },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          background: '#FFFFFF',
          surface: '#FFFFFF',
          'surface-bright': '#FFFFFF',
          'surface-variant': '#F0F4F9',
          primary: '#0B57D0',
          secondary: '#5F6368',
          error: '#C4364E',
          'on-background': '#1F1F1F',
          'on-surface': '#1F1F1F',
        },
      },
      dark: {
        dark: true,
        colors: {
          background: '#1F1F1F',
          surface: '#1F1F1F',
          'surface-bright': '#E3E3E3',
          'surface-variant': '#303134',
          primary: '#A8C7FA',
          secondary: '#9AA0A6',
          error: '#FF8597',
          'on-background': '#E3E3E3',
          'on-surface': '#E3E3E3',
          'on-primary': '#1F1F1F',
        },
      },
    },
  },
  defaults: {
    VBtn: { rounded: 0, style: 'text-transform: none; letter-spacing: 0' },
    VTextField: { density: 'compact', color: 'primary' },
    VTextarea: { density: 'compact', color: 'primary' },
    VSelect: { density: 'compact', color: 'primary' },
    VCombobox: { density: 'compact', color: 'primary' },
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
})
