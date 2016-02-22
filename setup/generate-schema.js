#!/usr/bin/env node
"use strict";

const xpath = require('xpath');
const dom = require('xmldom').DOMParser;
const fs = require('fs');

var xml = fs.readFileSync('clinvar_public.xsd', {encoding: 'utf8'});
var doc = new dom().parseFromString(xml);
var select = xpath.useNamespaces({'xs': 'http://www.w3.org/2001/XMLSchema'});

function xsdTypeToJsType(xsdType) {
  switch (xsdType) {
    case 'xs:string':
    case 'xs:anyURI':
      return String;
    case 'xs:int':
    case 'xs:integer':
    case 'xs:nonNegativeInteger':
    case 'xs:positiveInteger':
      return Number;
    case 'xs:date':
      return Date;
    default:
      return null;
  }
}

function copyProperties(dest, source) {
  Object.keys(source).forEach(function(key) {
    dest[key] = source[key];
  });
}

/**
 * Helper function to find a type by name and build it
 */
function findAndBuildType(type) {
  //TODO: search local context first

  var typeElement = select('//xs:complexType[@name="' + type + '"]', doc)[0];
  if (typeElement)
    return buildType(typeElement, elementsToCollect);

  typeElement = select('//xs:simpleType[@name="' + type + '"]/xs:restriction/@base', doc)[0];
  if (typeElement) {
    var jsType = xsdTypeToJsType(typeElement.textContent);
    if (!jsType) {
      console.log('WARNING: Unable to convert XSD type ' + type + ' to a JS type');
      return String;
    }
    return jsType;
  }

  console.log('WARNING: Assuming that type ' + type + ' is the same as xs:string');
  return String;
}

/**
 * Builds an object that will represent to Mongoose what is expressed in an XSD
 * file
 *
 * element is the root of the document, and elementsToCollect is an empty object
 * which will receive a list of elements that may occur more than once.
 */
function buildType(element, elementsToCollect, alreadyArray) {
  //determine if the element represents an array of elements
  if (element.hasAttribute('maxOccurs') && !alreadyArray) {
    var maxOccurs = element.getAttribute('maxOccurs');
    if (maxOccurs == 'unbounded' || parseInt(maxOccurs) > 1) {
      elementsToCollect[element.getAttribute('name') || element.getAttribute('ref')] = 1;
      return [buildType(element, elementsToCollect, true)];
    }
  }

  //if the element has a type attribute, use it
  if (element.hasAttribute('type')) {
    var xsdType = element.getAttribute('type');
    var jsType = xsdTypeToJsType(xsdType);

    if (jsType)
      return jsType;

    return findAndBuildType(xsdType);
  }

  //if the element has a ref attribute, use it
  if (element.hasAttribute('ref')) {
    var ref = element.getAttribute('ref');
    var refElement = select('//*[@name="' + ref + '"]', doc)[0];
    if (refElement)
      return buildType(refElement, elementsToCollect);
    else
      console.log('ERROR: Unable to find the referenced element or attribute ' + ref);
  }

  //if the element has an unnamed <xs:simpleType> child, use it
  var xsdType = select('xs:simpleType[not(@name)]/xs:restriction/@base', element)[0];
  if (xsdType) {
    jsType = xsdTypeToJsType(xsdType.textContent);
    if (!jsType) {
      console.log('WARNING: Unable to convert XSD type ' + xsdType + ' to a JS type');
      return String;
    }
    return jsType;
  }

  var ret = {};

  //if the element has a base attribute, append it and continue
  //the base attribute allows an element with attributes to have text too
  if (element.hasAttribute('base')) {
    var base = element.getAttribute('base');
    var jsType = xsdTypeToJsType(base);
    if (jsType) {
      ret['text'] = jsType;
    } else {
      var refType = findAndBuildType(base);
      if (refType instanceof Function)
        ret['text'] = refType;
      else
        copyProperties(ret, refType);
    }
  }

  //build the element's type by looking at its contents
  if (element.hasChildNodes()) {
    for (var i = 0; i < element.childNodes.length; i++) {
      var child = element.childNodes[i];
      switch (child.nodeName) {
        case 'xs:element':
        case 'xs:attribute':
          //recursively add elements and attributes
          ret[child.getAttribute('name') || child.getAttribute('ref')] = buildType(child, elementsToCollect);
          break;
        default:
          //descend into other nodes to find elements and attributes
          //only descend into element nodes (not text nodes, comments, etc.)
          if (child.nodeType != 1)
            continue;

          copyProperties(ret, buildType(child, elementsToCollect));
      }
    }
    return ret;
  }

  console.log('WARNING: Assuming that ' + (element.getAttribute('name') || element.getAttribute('ref')) + ' has type xs:string');
  return String;
}

/**
 * Outputs a JSON string that uses literal type names instead of turning them
 * into strings like JSON.stringify does
 */
function jsonify(obj, varName, indentation) {
  indentation = indentation || 0;
  var spaces = (new Array(indentation + 1)).join(' ');
  var ret = spaces;

  if (varName)
    ret += '"' + varName + '": ';

  switch (typeof(obj)) {
    case 'function':
      ret += obj.name;
      break;
    case 'object':
      if (Array.isArray(obj)) {
        ret += '[\n';
        for (var i = 0; i < obj.length; i++) {
          ret += jsonify(obj[i], null, indentation + 2) + '\n';
        }
        ret += spaces + ']';
      } else {
        ret += '{\n'
        Object.keys(obj).forEach(function(key) {
          ret += jsonify(obj[key], key, indentation + 2) + '\n';
        });
        ret += spaces + '}';
      }
      break;
    default:
      ret += obj;
  }

  if (indentation > 0)
    ret += ',';

  return ret;
}

var elementsToCollect = {};
var flatSchema = {};

function flattenSchema(element, prefix) {
  Object.keys(element).forEach(function(key) {
    if (Array.isArray(element))
      flattenSchema(element[key], prefix);
    else if (typeof(element[key]) == 'object')
      flattenSchema(element[key], prefix + key + '.');
    else
      flatSchema[prefix + key] = element[key];
  });
}

console.log('Generating schema...');
var schema = buildType(select('//xs:element[@name="ClinVarSet"]', doc)[0], elementsToCollect);
flattenSchema(schema, '');

fs.writeFileSync('models/clinvar-schema.js',
  'module.exports = ' + jsonify(schema) + ';');

fs.writeFileSync('models/clinvar-collects.js',
  'module.exports = ' + JSON.stringify(elementsToCollect, null, 2) + ';');

fs.writeFileSync('models/clinvar-schema-flat.js',
  'module.exports = ' + jsonify(flatSchema) + ';');

fs.writeFileSync('models/clinvarset.js',
  'var mongoose = require("./sources/mongoose");\n' +
  'var clinvarSchema = require("./clinvar-schema");\n' +
  'module.exports = mongoose.model("ClinVarSet", clinvarSchema);');
