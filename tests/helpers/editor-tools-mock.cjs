const { ref } = require('vue')
exports.useEditorTools = () => ({
  sqlInjectionDialog: ref({ show: false }),
  reverseShellDialog: ref({ show: false }),
  customPayloadDialog: ref({ show: false }),
  onFocus() {},
  clearEditorFocus() {},
})
