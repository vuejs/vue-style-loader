/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Tobias Koppers @sokra
  Modified by Evan You @yyx990803
*/
var loaderUtils = require('loader-utils')
var path = require('path')
var hash = require('hash-sum')
var qs = require('querystring')

module.exports = function () {}

module.exports.pitch = function (remainingRequest) {
  var isServer = this.target === 'node'
  var isProduction = this.minimize || process.env.NODE_ENV === 'production'
  var addStylesClientPath = loaderUtils.stringifyRequest(this, '!' + path.join(__dirname, 'lib/addStylesClient.js'))
  var addStylesServerPath = loaderUtils.stringifyRequest(this, '!' + path.join(__dirname, 'lib/addStylesServer.js'))

  var request = loaderUtils.stringifyRequest(this, '!!' + remainingRequest)
  var relPath = path.relative(__dirname, this.resourcePath).replace(/\\/g, '/')
  var id = JSON.stringify(hash(request + relPath))
  var options = loaderUtils.getOptions(this) || {}

  // direct css import from js --> direct, or manually call `styles.__inject__(ssrContext)` with `manualInject` option
  // css import from vue file --> component lifecycle linked
  // style embedded in vue file --> component lifecycle linked
  var isVue = (
    /"vue":true/.test(remainingRequest) ||
    options.manualInject ||
    qs.parse(this.resourceQuery.slice(1)).vue != null
  )

  var shared = [
    '// style-loader: Adds some css to the DOM by adding a <style> tag',
    '',
    '// load the styles',
    'var content = require(' + request + ');',
    // content list format is [id, css, media, sourceMap]
    "if(typeof content === 'string') content = [[module.id, content, '']];",
    'if(content.locals) module.exports = content.locals;'
  ]

  if (!isServer) {
    var code = function(id, isProduction, options) {
      // style-loader: Adds some css to the DOM by adding a <style> tag
      var content = require(REQUEST)
      var addStylesClient = require(ADD_STYLES_CLIENT_PATH).default
      var install = function(target) {
        update = addStylesClient(id, content, isProduction, options, target)
      }
      var update = null
      if (typeof content === 'string') content = [[module.id, content, '']]
      if (content.locals) {
        module.exports = content.locals
        return
      } else if (module.hot) {
        module.hot.accept(REQUEST, function() {
          var newContent = require(REQUEST)
          if (typeof newContent === 'string') newContent = [[module.id, newContent, '']]
          update(newContent)
        })
        module.hot.dispose(function() {
          update();
        })
      }
      if (options.shadowMode) {
        module.exports.__inject__ = function(shadowRoot) {
          install(shadowRoot)
        }
      } else {
        install(typeof document !== 'undefined' && document.head)
      }
    }
    return `(${code})(${id},${isProduction},${JSON.stringify(options)})`
      .split('REQUEST').join(request)
      .split('ADD_STYLES_CLIENT_PATH').join(addStylesClientPath)

  } else {
    // on the server: attach to Vue SSR context
    if (isVue) {
      // inside *.vue file: expose a function so it can be called in
      // component's lifecycle hooks
      return shared.concat([
        '// add CSS to SSR context',
        'var add = require(' + addStylesServerPath + ').default',
        'module.exports.__inject__ = function (context) {',
        '  add(' + id + ', content, ' + isProduction + ', context)',
        '};'
      ]).join('\n')
    } else {
      // normal import
      return shared.concat([
        'require(' + addStylesServerPath + ').default(' + id + ', content, ' + isProduction + ')'
      ]).join('\n')
    }
  }
}
