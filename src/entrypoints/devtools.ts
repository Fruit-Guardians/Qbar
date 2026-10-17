import browser from 'webextension-polyfill'

browser.devtools.panels.create('QBar', 'icon.png', 'panel.html')
