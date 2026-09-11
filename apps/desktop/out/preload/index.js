"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("openfield", { version: "0.1.0" });
