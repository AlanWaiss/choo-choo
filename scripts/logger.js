"use strict";
import * as Constants from "./constants.js"

let trace = false;

export let enableTracing = (enabled = true) => {
    trace = enabled != false;
}

export let log = (...args) => {
    console.log(`${Constants.MODULE_TITLE} | INFO | `, ...args);
}

export let logError = (...args) => {
    console.log(`${Constants.MODULE_TITLE} | ERROR | `, ...args);
}

export let logTrace = (...args) => {
    if(trace) {
        console.log(`${Constants.MODULE_TITLE} | TRACE | `, ...args);
    }
}

export let logRawTrace = (...args) => {
    if(trace) {
        console.log(...args);
    }
}