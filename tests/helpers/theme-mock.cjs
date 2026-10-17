const { ref } = require('vue')
exports.useTheme = () => ({ global: { name: ref('light') } })
