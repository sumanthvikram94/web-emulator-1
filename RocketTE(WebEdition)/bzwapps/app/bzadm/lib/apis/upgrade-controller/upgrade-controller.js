'use strict';

/**
 * Name:      upgrade-controller.js
 * Desc:      Provide api to return the sessionMode related configurations
 * Copyright: © 2014-2020 Rocket Software, Inc. or its affiliates. All Rights Reserved. 
 *            ROCKET SOFTWARE, INC. CONFIDENTIAL
 */
const fse = require('fs-extra');
const fs = fse;
const express = require('express');
const Promise = require('bluebird');
// const bodyParser = require('body-parser');
const UpgradeDataService = require('../../services/upgrade-data.service');
const W2hUpgradeService = require('../../services/upgrade-data-w2h.service');
const bzdb = require('../../../../bzshared/lib/services/bzdb.service');
const authConfigService=require("../../../../bzshared/lib/services/authConfigService");
const userDataServiceFile= require('../../services/userDataServiceFile');
const sessionSettingsDataServiceFile= require('../../services/session-settings.service');
const Utiles = require('../../services/utils.service');
const GROUP_PATH = '/groups';
const KEYBOARD_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings/keyboardmapping';
const DEFAULT_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/defaults';
const BASE_PATH = '/ZLUX/pluginStorage/com.rs.bzadm/sessionSettings';
const path = require('path');
const userSrc = require('../../../../bzshared/lib/apis/user-resource/user-resource-service');
const Security=require("../../../../bzshared/lib/services/security.service");

class UpgradeRouter {

    constructor(context){
        this.context = context;
        this.logger = context.logger;
        this.router = express.Router();
        this.upgradeDataService = new UpgradeDataService(context);
        this.w2hUpgrade = new W2hUpgradeService(context, this.upgradeDataService);
        //this.authConfigObj=authConfigService.init(context);
        this.utiles = new Utiles(context);
        //this.userDataService=userDataServiceFile.init(context,this.authConfigObj);
        this.instanceDir = this.context.plugin.server.config.user.instanceDir;
        this.sessionSettingsService = sessionSettingsDataServiceFile.init(context);
        this.productDir = this.context.plugin.server.config.user.productDir;
        this.log4import = this.initLogger();

        authConfigService.init(context).then((obj)=>{
            this.authConfigObj=obj;
            this.userDataService = userDataServiceFile.init(context,this.authConfigObj);
        });

        
        this.wc2rte3270Funcs = {
            "enter" : "Enter",
            "clear" : "Clear",
            "attn" : "Attn",
            "bksp" : "Backspace",
            "bktab" : "Back Tab",
            "rotcp" : "", //E3_KEY_CPROTATE
            "curdw" : "Cursor Down",
            "curup" : "Cursor Up",
            "curlf" : "Cursor Left",
            "cursl" : "Cursor Select",
            "currt" : "Cursor Right",
            "cutsel" : "Cut",
            "dbllf" : "Rapid Left",
            "dblrt" : "Rapid Right",
            "delwd" : "Erase Word",
            "delcr" : "Delete",
            "dup" : "Dup",
            "ereof" : "Erase EOF",
            "erinp" : "Erase Input",
            "fldmk" : "Field Mark",
            "home" : "Home",
            "insert" : "Insert",
            "lightpen" : "", //Lightpen?
            "nwlne" : "New Line",
            "pa1" : "PA1",
            "pa2" : "PA2",
            "pa3" : "PA3",
            "pf1" : "PF01",
            "pf2" : "PF02",
            "pf3" : "PF03",
            "pf4" : "PF04",
            "pf5" : "PF05",
            "pf6" : "PF06",
            "pf7" : "PF07",
            "pf8" : "PF08",
            "pf9" : "PF09",
            "pf10" : "PF10",
            "pf11" : "PF11",
            "pf12" : "PF12",
            "pf13" : "PF13",
            "pf14" : "PF14",
            "pf15" : "PF15",
            "pf16" : "PF16",
            "pf17" : "PF17",
            "pf18" : "PF18",
            "pf19" : "PF19",
            "pf20" : "PF20",
            "pf21" : "PF21",
            "pf22" : "PF22",
            "pf23" : "PF23",
            "pf24" : "PF24",
            "reset" : "Reset",
            "sysrq" : "Sys Req",
            "tab" : "Tab",
            "wdlf" : "",  //Word Left
            "wdrt" : "",  //Word Right
            "tsrc" : "",  //TSO Receive
            "tssd" : "",  //TSO Send
            "circ" : "",  //CICS Receive
            "cisd" : "",  //CICS Send
            "vmrc" : "",  //VM Receive
            "vmsd" : "",  //VM Send
            "waitc" : "",  //?
            "movec" : "",  //?
            "erfld" : "Erase Field",
            "stfld" : "",  //Start Field
            "enfld" : "End",
            "tglfm" : "",  //Toggle fm?
            "tglsi" : "",  //Toggle si?
            "creot" : "",  //Cursor EOT
            "delfw" : "",  //Delete Full Word?
            "tglwc" : "",  //Toggle wc?
            "tglhs" : "",  //Toggle Hotspot?
            "lckbkspace" : "",  //Lock Backspace?
            "sela" : "Select All",
        };

        this.wc2rte5250Funcs = {
            "alta" : "",
            "altb" : "",
            "altbacktab" :  "",
            "altc" : "",
            "altd" : "",
            "altdown" :  "",
            "altfldplus" :  "",
            "altfldminus" :  "",
            "altfldexit:" : "",
            "alth" : "",
            "altj" : "",
            "altleft" : "",
            "altn" : "",
            "altp" : "",
            "altright" : "",
            "alts" : "",
            "altspace" : "",
            "alttab" : "",
            "altu" : "",
            "altup" : "",
            "altw" : "",
            "alty" : "",
            "attn" : "Attn",
            "bktab" : "Back Tab",
            "bksp" : "Backspace",
            "clear" : "Clear",
            "cmd" : "",
            "creot" : "",
            "curdw" : "Cursor Down",
            "curup" : "Cursor Up",
            "curlf" : "Cursor Left",
            "cursl" : "Cursor Select",
            "currt" : "Cursor Right",
            "cutsel" : "Cut",
            "dead" : "",
            "delfw" : "",
            "delwd" : "Erase Word",
            "dbllf" : "Rapid Left",
            "dblrt" : "Rapid Right",
            "dup" : "Dup",
            "enfld" : "End",
            "enter" : "Enter",
            "ereof" : "Erase EOF",
            "erfld" : "Erase Field",
            "erinp" : "Erase Input",
            "f1" : "CF01",
            "f2" : "CF02",
            "f3" : "CF03",
            "f4" : "CF04",
            "f5" : "CF05",
            "f6" : "CF06",
            "f7" : "CF07",
            "f8" : "CF08",
            "f9" : "CF09",
            "f10" : "CF10",
            "f11" : "CF11",
            "f12" : "CF12",
            "f13" : "CF13",
            "f14" : "CF14",
            "f15" : "CF15",
            "f16" : "CF16",
            "f17" : "CF17",
            "f18" : "CF18",
            "f19" : "CF19",
            "f20" : "CF20",
            "f21" : "CF21",
            "f22" : "CF22",
            "f23" : "CF23",
            "f24" : "CF24",
            "fldp" : "Field +",
            "fldm" : "Field -",
            "fldx" : "Field Exit",
            "help" : "Help",
            "home" : "Home",
            "insert" : "Insert",
            "lckbkspace" : "",
            "nwlne" : "New Line",
            "pa1" : "PA1",
            "pa2" : "PA2",
            "pa3" : "PA3",
            "rldw" : "Page Up",
            "rlup" : "Page Down",
            "print" : "Print",
            "reset" : "Reset",
            "stfld" : "",
            "sysrq" : "Sys Req",
            "tab" : "Tab",
            "test" : "Test Request",
            "wdlf" : "",
            "wdrt" : "",
            "sela" : "Select All",
            "cpyapp" : "", //Copy Append Selection
        };

        this.wc2rteVTFuncs = {
            "bksp" : "Backspace",
            "cpysel" : "Copy",
            "curdw" : "Cursor Down",
            "curlf" : "Cursor Left",
            "currt" : "Cursor Right",
            "curup" : "Cursor Up",
            "delcr" : "Delete",
            //"" : "End",
            "return" : "Enter",
            "esc" : "Escape",
            //"" : "Home",
            "insh" : "Insert",
            "pf1" : "KP_PF01",
            "pf2" : "KP_PF02",
            "pf3" : "KP_PF03",
            "pf4" : "KP_PF04",
            "f1" : "PF01",
            "f2" : "PF02",
            "f3" : "PF03",
            "f4" : "PF04",
            "f5" : "PF05",
            "f6" : "PF06",
            "f7" : "PF07",
            "f8" : "PF08",
            "f9" : "PF09",
            "f10" : "PF10",
            "f11" : "PF11",
            "f12" : "PF12",
            "f13" : "PF13",
            "f14" : "PF14",
            "f15" : "PF15",
            "f16" : "PF16",
            "f17" : "PF17",
            "f18" : "PF18",
            "f19" : "PF19",
            "f20" : "PF20",
            "nxtsc" : "Page Down",
            "prvsc" : "Page Up",
            "prscr" : "Print",
            "tab" : "Tab",
            "sela" : "Select All",
            "beep" : "",
            "blpst" : "", //Block Paste
            "cpyapp" : "", //Copy Append Selection
            "dead" : "", //DeadKey
            "do" : "", //Do
            "eplay" : "", //End Macro
            "exit" : "", //Exit
            "find" : "", //Find
            "help" : "", //Help
            "kpmult" : "", //KP*
            "kpcma" : "", //KP,
            "kpdiv" : "", //KP\
            "kp0" : "", //KP0
            "kpent" : "", //KPEnter
            "newwin" : "", //New Session
            "nextses" : "", //Next Session
            "pstbf" : "", //Paste Buffer
            "playm" : "", //Play Macro
            "requidpw" : "", //Request User ID/PW
            "rem" : "", //Remove
            "rsel" : "", //Reset Selection
            "runftp" : "", //Run FTP Program
            "sel" : "", //Select
            "seldown" : "", //Select Down
            "selend" : "", //Select End
            "self" : "", //Select Field
            "selhome" : "", //Select Home
            "selleft" : "", //Select Left
            "selpagedown" : "", //Select Page Down
            "selpageup" : "", //Select Page Up
            "selright" : "", //Select Right
            "selft" : "", //Select Text
            "selup" : "", //Select Up
            "selw" : "", //Select Word
            "shkm" : "", //Show KeyMap
            

        };

        this.wc2Key = {
            "!" : "d(1)+Shift",
			"@" : "d(2)+Shift",
			"#" : "d(3)+Shift",
			"$" : "d(4)+Shift",
			"%" : "d(5)+Shift",
			"^" : "d(6)+Shift",
			"&" : "d(7)+Shift",
			"*" : "d(8)+Shift",
			"(" : "d(9)+Shift",
			")" : "d(0)+Shift",
			"_" : "d(Minus)+Shift",
			"+" : "d(Equal)+Shift",
			"-" : "d(Minus)",
			"=" : "d(Equal)",
			"`" : "d(Backquote)",
			"~" : "d(Backquote)+Shift",
			"[" : "d(BracketLeft)",
			"]" : "d(BracketRight)",
			"{" : "d(BracketLeft)+Shift",
			"}" : "d(BracketRight)+Shift",
			";" : "d(Semicolon)",
			"'" : "d(Quote)",
			":" : "d(Semicolon)+Shift",
			"\"" : "d(Quote)+Shift",
			"," : "d(Comma)",
			"." : "d(Period)",
			"/" : "d(Slash)",
			"?" : "d(Slash)+Shift",
			"\\" : "d(Backslash)",
			"|" : "d(Backslash)+Shift",
			"Left_Ctrl" : "d(ControlLeft)",
			"Right_Ctrl" : "d(ControlRight)",
			"NumPad_Enter" : "d(NumpadEnter)",
			"\\0020" : "d(Space)",
			"A" : "d(a)+Shift",
			"B" : "d(b)+Shift",
			"C" : "d(c)+Shift",
			"D" : "d(d)+Shift",
			"E" : "d(e)+Shift",
			"F" : "d(f)+Shift",
			"G" : "d(g)+Shift",
			"H" : "d(h)+Shift",
			"I" : "d(i)+Shift",
			"J" : "d(j)+Shift",
			"K" : "d(k)+Shift",
			"L" : "d(l)+Shift",
			"M" : "d(m)+Shift",
			"N" : "d(n)+Shift",
			"O" : "d(o)+Shift",
			"P" : "d(p)+Shift",
			"Q" : "d(q)+Shift",
			"R" : "d(r)+Shift",
			"S" : "d(s)+Shift",
			"T" : "d(t)+Shift",
			"U" : "d(u)+Shift",
			"V" : "d(v)+Shift",
			"W" : "d(w)+Shift",
			"X" : "d(x)+Shift",
			"Y" : "d(y)+Shift",
			"Z" : "d(z)+Shift",
            "NumPad_Subtract" : "d(Numpad-)",
            "NumPad_Divide" : "d(Numpad/)",
            "NumPad_Multiply" : "d(Numpad*)",
            "NumPad_Add" : "d(Numpad+)",
            "NumPad_Decimal" : "d(Numpad.)",
            "NumPad_0" : "d(Numpad0)",
            "NumPad_1" : "d(Numpad1)",
            "NumPad_2" : "d(Numpad2)",
            "NumPad_3" : "d(Numpad3)",
            "NumPad_4" : "d(Numpad4)",
            "NumPad_5" : "d(Numpad5)",
            "NumPad_6" : "d(Numpad6)",
            "NumPad_7" : "d(Numpad7)",
            "NumPad_8" : "d(Numpad8)",
            "NumPad_9" : "d(Numpad9)",
            "Shift" : "d()",
            "Alt" : "d()",
            "Ctrl" : "d()",
        }

        this.defaultSes = ["def3270","def3287","def3812","def5250","defrui","defssh","defvt","WC00"];
        this.sesSucess = new Map();
        this.groupSucessCount = 0;
        this.userSucessCount = 0;
        this.keymapSucessCount = 0;
        this.attrSucessCount =0;
        this.hspSucessCount =0;
        this.needToUpdScope = new Array();// store to which session have to update or insert
    }

    printContext() {
        this.logger.info(JSON.stringify(this.context));
    }

    /**
     * Gettor of the router
     */
    getRouter() {
        return this.router;
    };

    attribColor(attrib, type, foreground) {
        if (attrib[type]) { //Attr exists
            if (foreground) {
                if (attrib[type].Foreground)
                    return attrib[type].Foreground; //cfgDir defaults use upper case for first letter
                else
                    return attrib[type].foreground; //Profile files use all lowercase
            }
            else
            {
                if (attrib[type].Background)
                    return attrib[type].Background; //cfgDir defaults use upper case for first letter
                else
                    return attrib[type].background; //Profile files use all lowercase
            }
        }
    }

    setdefaultPrefs(prefs,Type) {
        prefs.font = { fontName:"Lucida Console",fontSize:12,fontWeight:"Normal",fontScaleMethod:1,fontStyle:"normal",autoSizeFont:true,autoSizeWindow:false};
        if (Type == 'VT') {
            prefs.font.sessionScrollbackEnabled = true;
            prefs.font.vtHistoryScrollBufferLines = 500;
        }
        prefs.contextRightClick = true;
        prefs.cursor = {horizontalGuide:false,verticalGuide:false,underlineCursor:false,steadyCursor:false};
        prefs.language = {langSelection:"International EBCDIC 1047"};
        prefs.language_w2h = {langSelection:"English (U.S.) (37)",euro:false};
        if (prefs.hotspots==undefined) {
            prefs.hotspots = {enable:true,show:true,turnOnURL:true,renderingType:"button",renderingForegroundColor:"#FF0000",renderingBackgroundColor:"#ffffff",renderingFont:"Lucida Console"};
        }
        if (prefs.launchpadConfig==undefined) {
            prefs.launchpadConfig = {enable:true,displayOption:"IconOnly",positionOption:"top"};
        }
    }

    convertClkPads(prefs,launchpad,wcclickpad,bType) {
        launchpad.launchpad = [];
        for (let key2 in wcclickpad.ClickPad) {
            let clk = wcclickpad.ClickPad[key2];
            const action = clk.split(/:/);
            var lp = {};
            lp["optionId"] = launchpad.launchpad.length + 1;
            if ( action[0] == 'KEY' ) {
                let wc2rteFuncs = {};
                let actionType = "";
                if (bType === "3270") {
                    actionType = "KEYMAP_TYPE_3270FUNCTION";
                    wc2rteFuncs = this.wc2rte3270Funcs;
                }
                else if (bType === "5250") {
                    actionType = "KEYMAP_TYPE_5250FUNCTION";
                    wc2rteFuncs = this.wc2rte5250Funcs;
                }
                else if (bType === "VT") {
                    actionType = "KEYMAP_TYPE_VTFUNCTION";
                    wc2rteFuncs = this.wc2rteVTFuncs;
                }

                let rteFunc = "";
                if(wc2rteFuncs[action[1].toLowerCase()] != undefined) {
                    rteFunc = wc2rteFuncs[action[1].toLowerCase()];
                    if ( rteFunc != '') {                    
                        lp["name"] = rteFunc;
                        lp["tooltip"] = rteFunc;
                        lp["actionType"] = actionType;
                        lp["action"] = rteFunc;
                        if (bType === "VT") {
                            if (rteFunc.startsWith("PF")) { //Need to convert PF01 to F1 for iconName
                                rteFunc = "F" + Number(rteFunc.slice(-2)).toString();
                            }
                            else if (rteFunc.startsWith("KP_PF")) { //Need to convert KP_PF01 to PF1 for iconName
                                rteFunc = "PF" + Number(rteFunc.slice(-2)).toString();
                            }
                        }
                        else if (bType === "5250") {
                            if (rteFunc.startsWith("CF")) { //Need to convert CF01 to F1 for iconName
                                rteFunc = "CF" + Number(rteFunc.slice(-2)).toString();
                            }
                        }
                        else if (bType === "3270") {
                            if (rteFunc.startsWith("PF")) { //Need to convert PF01 to F1 for iconName
                                rteFunc = "PF" + Number(rteFunc.slice(-2)).toString();
                            }
                        }

                        const UnknownIcons = ["Cut", "Select All", "Cursor Select"];
                        if (UnknownIcons.includes(rteFunc)) //no matching icons in this list
                            rteFunc = "Default icon";

                        lp["iconName"] = rteFunc;
                        launchpad.launchpad.push(lp);
                    }
                }
            }
            /* disable macros for now
            else if ( action[0] == 'MACRO') {
                lp["name"] = action[1];
                lp["tooltip"] = action[1];
                lp["actionType"] = "KEYMAP_TYPE_SCRIPT";
                lp["action"] = action[1];
                lp["iconName"] = "";
                launchpad.launchpad.push(lp);
            }
            */
            else {
                //KEYMAP_TYPE_STRING no obvious WC support for strings
            }
            
        };

        if (wcclickpad.Configuration.Position === "South") {
            prefs.launchpadConfig.positionOption = "bottom";
        }
        else if (wcclickpad.Configuration.Position === "North") {
            prefs.launchpadConfig.positionOption = "top";
        }
        else if (wcclickpad.Configuration.Position === "West") {
            prefs.launchpadConfig.positionOption = "left";
        }
        else { //East
            prefs.launchpadConfig.positionOption = "right";
        }
    }

    convertAttrColors(prefs,attrib,color,bType) {
        prefs.color = {};
        if (bType === "3270") {
            prefs.color["backgroundColor"] = "#" + color.ColorMap[this.attribColor(attrib,"BASE-Protected",false)];
            prefs.color["protectedBoldColor"] = "#" + color.ColorMap[this.attribColor(attrib,"BASE-Protected-Intense",true)];
            prefs.color["unProtectedBoldColor"] = "#" + color.ColorMap[this.attribColor(attrib,"BASE-Unprotected-Intense",true)];
            prefs.color["protectedColor"] = "#" + color.ColorMap[this.attribColor(attrib,"BASE-Protected",true)];
            prefs.color["unProtectedColor"] = "#" + color.ColorMap[this.attribColor(attrib,"BASE-Unprotected",true)];
            prefs.color["extendedBlue"] = "#" + color.ColorMap[this.attribColor(attrib,"EXTENDED-Blue",true)];
            prefs.color["extendedRed"] = "#" + color.ColorMap[this.attribColor(attrib,"EXTENDED-Red",true)];
            prefs.color["extendedPink"] = "#" + color.ColorMap[this.attribColor(attrib,"EXTENDED-Pink",true)];
            prefs.color["extendedGreen"] = "#" + color.ColorMap[this.attribColor(attrib,"EXTENDED-Green",true)];
            prefs.color["extendedTurquiose"] = "#" + color.ColorMap[this.attribColor(attrib,"EXTENDED-Turquoise",true)];
            prefs.color["extendedYellow"] = "#" + color.ColorMap[this.attribColor(attrib,"EXTENDED-Yellow",true)];
            prefs.color["extendedWhite"] = "#" + color.ColorMap[this.attribColor(attrib,"EXTENDED-White",true)];
            prefs.color["oiaTextColor"] = "#ffffff";
        }
        else if (bType === "5250") {
            prefs.color["backgroundColor"] = "#" + color.ColorMap[this.attribColor(attrib,"Attr_20",false)];
            prefs.color["extendedBlue"] = "#" + color.ColorMap[this.attribColor(attrib,"Attr_3A",true)];
            prefs.color["extendedRed"] = "#" + color.ColorMap[this.attribColor(attrib,"Attr_28",true)];
            prefs.color["extendedPink"] = "#" + color.ColorMap[this.attribColor(attrib,"Attr_38",true)];
            prefs.color["extendedGreen"] = "#" + color.ColorMap[this.attribColor(attrib,"Attr_20",true)];
            prefs.color["extendedTurquiose"] = "#" + color.ColorMap[this.attribColor(attrib,"Attr_30",true)];
            prefs.color["extendedYellow"] = "#" + color.ColorMap[this.attribColor(attrib,"Attr_32",true)];
            prefs.color["extendedWhite"] = "#" + color.ColorMap[this.attribColor(attrib,"Attr_22",true)];
            prefs.color["oiaTextColor"] = "#ffffff";
        }
        else if (bType === "VT") {
            //No underscore options in RTE?
            prefs.color["foregroundColor"] = "#" + color.ColorMap[this.attribColor(attrib,"Normal",true)];
            prefs.color["backgroundColor"] = "#" + color.ColorMap[this.attribColor(attrib,"Normal",false)];
            prefs.color["foregroundBold"] = "#" + color.ColorMap[this.attribColor(attrib,"Bold",true)];
            prefs.color["backgroundBold"] = "#" + color.ColorMap[this.attribColor(attrib,"Bold",false)];
            prefs.color["foregroundBlinking"] = "#" + color.ColorMap[this.attribColor(attrib,"Blink",true)];
            prefs.color["backgroundBlinking"] = "#" + color.ColorMap[this.attribColor(attrib,"Blink",false)];
            prefs.color["foregroundBoldBlinking"] = "#" + color.ColorMap[this.attribColor(attrib,"Bold + Blink",true)];
            prefs.color["backgroundBoldBlinking"] = "#" + color.ColorMap[this.attribColor(attrib,"Bold + Blink",false)];
            prefs.color["inverseForeground"] = "#" + color.ColorMap[this.attribColor(attrib,"Reverse",false)];
            prefs.color["inverseBackground"] = "#" + color.ColorMap[this.attribColor(attrib,"Reverse",true)];
            prefs.color["inverseForegroundBold"] = "#" + color.ColorMap[this.attribColor(attrib,"Bold + Reverse",false)];
            prefs.color["inverseBackgroundBold"] = "#" + color.ColorMap[this.attribColor(attrib,"Bold + Reverse",true)];
            prefs.color["inverseForegroundBlinking"] = "#" + color.ColorMap[this.attribColor(attrib,"Blink + Reverse",false)];
            prefs.color["inverseBackgroundBlinking"] = "#" + color.ColorMap[this.attribColor(attrib,"Blink + Reverse",true)];
            prefs.color["inverseForegroundBoldBlinking"] = "#" + color.ColorMap[this.attribColor(attrib,"Bold + Blink + Reverse",false)];
            prefs.color["inverseBackgroundBoldBlinking"] = "#" + color.ColorMap[this.attribColor(attrib,"Bold + Blink + Reverse",true)];
            prefs.color["extendedVTBlue"] = "#" + color.ColorMap["Blue"];
            prefs.color["extendedVTRed"] = "#" + color.ColorMap["Red"];
            prefs.color["extendedVTPink"] = "#" + color.ColorMap["Pink"];
            prefs.color["extendedVTGreen"] = "#" + color.ColorMap["Green"];
            prefs.color["extendedVTCyan"] = "#" + color.ColorMap["Turquoise"];
            prefs.color["extendedVTYellow"] = "#" + color.ColorMap["Yellow"];
            prefs.color["extendedVTBlack"] = "#" + color.ColorMap["Black"];
            prefs.color["extendedVTGray"] = "#" + color.ColorMap["LightGray"];
            prefs.color["extendedBoldVTBlue"] = "#" + color.ColorMap["LightBlue"];
            prefs.color["extendedBoldVTRed"] = "#" + color.ColorMap["LightRed"];
            prefs.color["extendedBoldVTPink"] = "#" + color.ColorMap["LightMagenta"];
            prefs.color["extendedBoldVTGreen"] = "#" + color.ColorMap["LightGreen"];
            prefs.color["extendedBoldVTCyan"] = "#" + color.ColorMap["LightTurquoise"];
            prefs.color["extendedBoldVTYellow"] = "#" + color.ColorMap["LightYellow"];
            prefs.color["extendedBoldVTWhite"] = "#" + color.ColorMap["White"];
            prefs.color["extendedBoldVTGray"] = "#" + color.ColorMap["Gray"];
            prefs.color["overrideInverse"] = true;
        }
        
        prefs.color["copyPasteForegroundColor"] = "#ffff66";
        prefs.color["copyPasteBackgroundColor"] = "#0000ff";
        prefs.color["cursorGuideColor"] = "#ff0000";
    }

    getUpgradeRouter() {
        const router = this.router;

        // router.use(bodyParser.json({type:'application/json'}));
        router.use(express.json());
        router.use(express.urlencoded({
            extended: true
        }));

        router.get('/isExist', async (req, res) => {
            const existObj = await this.upgradeDataService.isExistUpgradData(req);
            res.status(200).send(Object.assign(existObj, {upgradeDBStore: this.upgradeDataService.needRestart}));

            this.logger.info(`Check upgrade data existance successful, exist status is ${existObj.exist}, upgraded status is ${existObj.upgrade}`);
        });

        router.post('/data', async (req,res) => {
            let result;
            const inClusterMode = await this.upgradeDataService.isInClusterMode();
            if (inClusterMode) { // BZ-19202
                result = {
                    status:false,
                    message:'Failed to upgrade data: Could not do upgradation in cluster mode.',
                    type:'cluserMode'
                }                
                return res.status(500).send(result);
            }
            if (this.context.plugin.server.config.user.bzw2hMode) {
                result = await this.w2hUpgrade.doUpdate();
            } else {
                req.setTimeout(0) // no timeout
                result = await this.upgradeDataService.doUpgrade(req, res);
            }
            if (result.status) {
                await this.upgradeDataService.setUpgradeStatus(); 
            }
            const statusCode = result.status ? 200 : 500;
            res.status(statusCode).send(result);
        });

        router.delete('/', (req,res) => {
            const path = this.upgradeDataService.deployPath.replace('deploy', 'migrate');;
            if (fs.existsSync(path)) {
                try {
                    fse.remove(path, (err) => {
                        if (err){
                            this.logger.log(this.logger.SEVERE, 'delete upgrade folder failed '+path);
                            this.logger.log(this.logger.SEVERE, 'delete  upgrade folder error: ' + err.stack);
                            res.status(500).send({ status: false, message: 'delete upgrade folder failed.' });
                        }else{
                            this.logger.log(this.logger.INFO, 'delete upgrade folder succeeded '+ path);
                            res.status(200).send({ status: true, message: 'delete  upgrade folder succeeded.' });
                        } 
                        
                    });
                } catch (error) {
                    this.logger.log(this.logger.SEVERE, 'delete upgrade folder failed '+path);
                    this.logger.log(this.logger.SEVERE, 'delete  upgrade folder error: ' + err.stack);
                    res.status(500).send({ status: false, message: 'delete upgrade folder failed.' });
                    
                }
            } else {
                this.logger.warn('delete upgrade folder: folder does not exist, path is '+path);
                res.status(500).send({ status: false, message: 'folder does not exist.' });
            }
        });

        router.post('/ldap4wc', async (req, res) => {
            var destination = this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/temp";
            var isExist = fs.existsSync(destination);
            var hasError= false;
            var that = this;
            try{
                if(!isExist)
                {
                    await that.utiles.createDirs(destination);
                }else
                {
                    await that.utiles.rmdirSync(destination);
                    await that.utiles.createDirs(destination); 
                }
                await that.clearLog();
                //var ldapClient = require("node-ldap");
                var ldapClient = require("ldapjs");
                //var configAreas = ["cfgdir","profile"];
                var baseDN = req.body.baseDN; //"dc=dev,dc=rocketsoftware,dc=com"
                var ocInstanceName = req.body.InstanceName; //"wcMJ"
                var url = req.body.url;//"ldap://waldevbzmcj01.dev.rocketsoftware.com:389";
                var userDn = req.body.userDN; //"cn=admin,dc=dev,dc=rocketsoftware,dc=com";
                var password = Buffer.from(req.body.password, 'base64').toString('utf8');  //"rocket";
                
                var client =  ldapClient.createClient({
                    url: url,
                    connectTimeout:10000,
                    tlsOptions:{ 'rejectUnauthorized': false}
                    });;
                
                client.addListener('error', function (error) {
                    that.log4import.getLogger().error(error.stack);
                    res.status(500).send({ status: false, message: 'import ldap connection failed' });
                });
                await client.bind(userDn, password, async function(err, res1) {
                    if(err!=undefined&&err!=null)
                    {
                        that.log4import.getLogger().error(err.stack);
                        if (client) {
                            client.destroy();
                        }
                        res.status(500).send({ status: false, message: 'import ldap connection failed' });
                    }
                    var configAreas = ["cfgdir","profile"];
                    var hasCfgdir = true;
                    var hasProfile = true;
                    for (const config of configAreas){
                        let rows = await that.search(client,{
                            base: 'ocConfigArea='+config+',ocInstanceName='+ocInstanceName+',ocServerDomain=OpenConnect Servers,'+baseDN,
                            scope: 'sub', 
                            paged: 'true', 
                            filter: '(objectClass=*)'
                        });
                        for (let key in rows) {
                            let ldapRow = rows[key];
                            //Only create files is ocConfigName and ocConfigValue are valid for now
                            if ( (ldapRow.ocConfigName != undefined) && (ldapRow.ocConfigValue != undefined) ) {
                                let matched = await that.isMatched(ldapRow,req.body.agency);
                                if(!matched) continue;
                                var dstPath = destination + '/' + config + '/' + ldapRow.ocConfigName;
                                const filedataBase64 = ldapRow.ocConfigValue || '';
                                const filedata = Buffer.from(filedataBase64, 'base64').toString('utf8');
                                if (!fs.existsSync(path.dirname(dstPath))) {
                                    that.utiles.createDirs(path.dirname(dstPath));
                                }
                                try {
                                    const data = fs.writeFileSync(dstPath, filedata, { flag: 'w+' } )
                                    //file written successfully
                                } catch (err) {
                                    that.log4import.getLogger().error(err.stack);
                                }
                            }
                        }
                        if ( config == configAreas[configAreas.length- 1] ) {
                            client.destroy();
                            res.status(200).send({ status: true, message: 'import LDAP data succeeded.' });
                        }
                    }
                });
            }catch(err){
                    that.log4import.getLogger().error(err.stack);
                    client.destroy();
                    res.status(500).send({ status: false, message: 'import ldap connection failed' });
            }
        });

        //get json data from webconnect configuration file
        router.get('/data4wc', (req, res) => {
            var dirkey = req.query.dirkey;
            var wcUpgradeData = this.upgradeDataService.getWCdata(dirkey);
            wcUpgradeData.then(data => {
              res.setHeader('Content-Type','application/json');
              res.send(data);
            });
        });

        router.get('/clk4wc', async (req, res) => {
            
            let params = {};
            params.dirkey = req.query.dirkey;
            let rs =await this.doImportClkpad(params);
            if(rs)
            {
                res.status(200).send({ status: true, message: 'import succeeded.' });
            }
            else
            {
                res.status(500).send({ status: false, message: 'import failed.' });
                return;
            }
        });

        router.get('/hsp4wc', async (req, res) => {
            
            let params = {};
            params.dirkey = req.query.dirkey;
            let rs = await this.doImportHotspot(params);
            if(rs)
            {
                res.status(200).send({ status: true, message: 'import succeeded.' });
            }
            else
            {
                res.status(500).send({ status: false, message: 'import failed.' });
                return;
            }
           
        });

        router.get('/atm4wc', async (req, res) => {
            
            let params = {};
            params.dirkey = req.query.dirkey;
            let rs = await this.doImportAttribute(params);
            if(rs)
            {
                res.status(200).send({ status: true, message: 'import succeeded.' });
            }
            else
            {
                res.status(500).send({ status: false, message: 'import failed.' });
                return;
            }
           
        });

        //import sessions
        router.get('/ses4wc', async (req, res) => {
            let params = {};
            params.dirkey = req.query.dirkey;
            params.override = req.query.override;
            let rs = this.doImportSession(params);
            if(rs)
            {
                res.status(200).send({ status: true, message: 'import succeeded.' });
            }
            else
            {
                res.status(500).send({ status: false, message: 'import failed.' });
                return;
            }
        });
    
        //import user from webconnect configuration
        router.get('/user4wc', async (req, res) => {
            let params = {};
            params.dirkey = req.query.dirkey;
            params.override = req.query.override;
            params.autogroup = req.query.autogroup;
            let rs = this.doImportUser(params);
            if(rs)
            {
                res.status(200).send({ status: true, message: 'import succeeded.' });
            }
            else
            {
                res.status(500).send({ status: false, message: 'import failed.' });
                return;
            }
            
        });
        //import group
        router.get('/group4wc', async (req, res) => {
            let rs = await this.doImportGroup();
            if(rs)
            {
                res.status(200).send({ status: true, message: 'import succeeded.' });
            }
            else
            {
                res.status(500).send({ status: false, message: 'import failed.' });
                return;
            }
            
            
        });
        //import keyboard
        router.get('/keyboard4wc', async (req, res) => {
            let params = {};
            params.dirkey = req.query.dirkey;
            params.override = req.query.override;
            let rs = await this.doImportKeymap(params);
            if(rs)
            {
                res.status(200).send({ status: true, message: 'import succeeded.' });
            }
            else
            {
                res.status(500).send({ status: false, message: 'import failed.' });
                return;
            }
    });
        //import tls file
        router.get('/tls4wc', async (req, res) => {        
            let indexFile = this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/temp/security/cert.txt";  
            if (!fs.existsSync(indexFile)) return false;
            const mappingValue = fs.readFileSync(indexFile, "utf8");
            if (mappingValue) {
                
               var allLines = mappingValue.split("\n");
               var certicates = "";
               var beginCert=false;
               for(let i=0; i< allLines.length; i++) 
               {
                    var text = allLines[i];
                    if(text.indexOf("-----BEGIN CERTIFICATE-----")>=0)
                    {
                        beginCert=true;
                    }
                    if(beginCert)
                    {
                        certicates +=text+"\n";
                    }
                    if(text.indexOf("-----END CERTIFICATE-----")>=0)
                    {
                        beginCert=false;
                    }
               }
                var path = this.instanceDir;
                    path = path+"/ZLUX/serverConfig";
                var file = path+"/webconnect.cert";
                fs.writeFile(file,certicates,{},function(){});
            }
             
            res.setHeader('Content-Type','application/json');
            res.send({
                 status: true, 
                 message: 'import success'
           });
        });
        
        //decompress file
        router.post('/decom4wc', async (req, res) => {
            var destination = this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/temp";
            var isExist = fs.existsSync(destination);
            var hasError= false;
            var that = this;
            var filename = req.query.filename;
            try {
                if(!isExist)
                {
                    await that.utiles.createDirs(destination);
                }else
                {
                    try {
                        await that.utiles.rmdirSync(destination);
                    } catch (error) {
                        that.log4import.getLogger().error('remove dir  error:'+ error.stack);
                    }
                    await that.utiles.createDirs(destination); 
                }
            } catch (error) {
                that.log4import.getLogger().error('create dir error:'+ error.stack);
            }
            await that.clearLog();
            var multiparty = require('multiparty');
            var form = new multiparty.Form();
            form.encoding = 'utf-8';
            form.uploadDir = destination;
            form.maxFilesSize = 500 * 1024 * 1024;
            form.parse(req, function(err, fields, files) {
                var filesTemp = JSON.stringify(files, null, 2);
          
                if(err) {
                    that.log4import.getLogger().error('parse error:'+ err);
                }else {
                    var inputFile = files.inputFile[0];
                    var uploadedPath = inputFile.path;
                    var dstPath = destination+'/' + filename;//inputFile.originalFilename;
                    try{
                        uploadedPath = Security.sanitizePath(uploadedPath); // Ensure security
                        dstPath = Security.sanitizePath(dstPath);
                    }catch(e){
                        res.status(500).send('Illegal path');
                        return;
                    }
                    //rename
                    fs.rename(uploadedPath, dstPath, function(err) {
                        if(err) {
                            that.log4import.getLogger().error('rename error:'+ err);
                        }else {
                            that.log4import.getLogger().info('rename ok');
                            var compressing = require("compressing");
                            if(filename!=undefined && filename.toLowerCase().indexOf("zip")>=0)
                            {
                                compressing.zip.uncompress(dstPath, destination+"/").then(() => {
                                var hasCfgdir = true;
                                var hasProfile = true;
                                if(!fs.existsSync(destination+"/cfgdir"))
                                {
                                    hasCfgdir = false;
                                    that.log4import.getLogger().warn('cfgdir folder not found');
                                }
                                if(!fs.existsSync(destination+"/profile"))
                                {
                                    hasProfile = false;
                                    that.log4import.getLogger().warn('profile folder not found');
                                }
                                if(!hasCfgdir && !hasProfile)
                                {
                                    that.log4import.getLogger().error('neither folder cfgdir nor profile exists');
                                    res.status(500).send({ status: false, message: 'neither folder cfgdir nor profile exists' });
                                }else{
                                that.log4import.getLogger().info('decompress zip success');
                                res.status(200).send({ status: true, message: 'decompress zip success' });
                                }
                            })
                            .catch(err => {
                                hasError = true;
                                that.log4import.getLogger().error('decompress zip error:'+ err.stack);
                                res.status(500).send({ status: false, message: 'decompress zip failed.' });
                            });
                            }else if(filename!=undefined && filename.toLowerCase().indexOf("tar")>=0)
                            {
                                compressing.tar.uncompress(dstPath, destination+"/").then(() => {
                                    var hasCfgdir = true;
                                    var hasProfile = true;
                                    if(!fs.existsSync(destination+"/cfgdir"))
                                    {
                                        hasCfgdir = false;
                                        that.log4import.getLogger().warn('cfgdir folder not found');
                                    }
                                    if(!fs.existsSync(destination+"/profile"))
                                    {
                                        hasProfile = false;
                                        that.log4import.getLogger().warn('profile folder not found');
                                    }
                                    if(!hasCfgdir && !hasProfile)
                                    {
                                        that.log4import.getLogger().error('neither folder cfgdir nor profile exists');
                                        res.status(500).send({ status: false, message: 'neither folder cfgdir nor profile exists' });
                                    }else{
                                    that.log4import.getLogger().info('decompress tar success');
                                    res.status(200).send({ status: true, message: 'decompress tar success' });
                                    }
                                })
                                .catch(err => {
                                    hasError = true;
                                    that.log4import.getLogger().error('decompress tar error:'+ err.stack);
                                    res.status(500).send({ status: false, message: 'decompress tar failed' });
                                });
                            }else{
                                that.log4import.getLogger().error('decompress failed,Only support .zip and .tar files');
                                res.status(500).send({ status: false, message: 'decompress failed,Only support .zip and .tar files' });
                            }
                        }
                    })
                }
                
            });
        });
        
        //test connection for ldap on step1
        router.post('/testconn4ldap', async (req, res) => {
            var ldapClient = require("ldapjs");
            var baseDN = req.body.baseDN; //"dc=dev,dc=rocketsoftware,dc=com"
            var ocInstanceName = req.body.InstanceName; //"wcMJ"
            var url = req.body.url;//"ldap://waldevbzmcj01.dev.rocketsoftware.com:389";
            var userDn = req.body.userDN; //"cn=admin,dc=dev,dc=rocketsoftware,dc=com";
            var password = Buffer.from(req.body.password, 'base64').toString('utf8'); //"rocket";
            var that = this;
			try {
                var client =  ldapClient.createClient({
                    url: url,
                    connectTimeout:10000,
                    tlsOptions:{ 'rejectUnauthorized': false}
                  });;
                
                
                client.addListener('error', function (error) {
                    that.log4import.getLogger().error(error.stack);
                    res.status(500).send({ status: false, message: 'test ldap connection failed' });
                });
            
                await client.bind(userDn, password, async function(err, res1) {
                    if(err!=undefined&&err!=null)
                    {
                        that.log4import.getLogger().error(err.stack);
                        if (client) {
                            client.destroy();
                        }
                        res.status(500).send({ status: false, message: 'test ldap connection failed' });
                    }
                    var configAreas = ["cfgdir","profile"];
                    var hasCfgdir = true;
                    var hasProfile = true;
                    for (const config of configAreas){
                        let rows ;
                        try {
                                rows = await that.search(client,{
                                base: 'ocConfigArea='+config+',ocInstanceName='+ocInstanceName+',ocServerDomain=OpenConnect Servers,'+baseDN,
                                scope: 'sub', 
                                sizeLimit: '1',
                                paged: 'false',
                                //paged: 'true', 
                                filter: '(ocConfigArea='+config+')'
                            });
                        } catch (error) {
                            if(config=="cfgdir"&&rows==undefined)
                            {
                                hasCfgdir = false;
                                that.log4import.getLogger().warn('ocConfigArea cfgdir not found');
                            }
                            if(config=="profile"&&rows==undefined)
                            {
                                hasProfile = false;
                                that.log4import.getLogger().warn('ocConfigArea profile not found');
                            }
                        }
                        
                    }
                    if(!hasCfgdir && !hasProfile)
                    {
                        that.log4import.getLogger().error('neither ocConfigArea cfgdir nor profile exists');
                        if (client) {
                            client.destroy();
                        }
                        res.status(500).send({ status: false, message: 'neither folder cfgdir nor profile exists' });
                    }else{
                        that.log4import.getLogger().info("test ldap connection successfully");
                        if (client) {
                            client.destroy();
                        }
                        res.status(200).send({ status: true, message: 'test ldap connection successfully' });
                    }
                    
                })/*.catch(function(err) {
                    that.log4import.getLogger().error(err.stack);
                    if (client) {
                        client.destroy();
                    }   
                    res.status(500).send({ status: false, message: 'test ldap connection failed' });
                });*/
            } catch (error) {
                that.log4import.getLogger().error(error.stack);
                if (client) {
                    client.destroy();
                }
                res.status(500).send({ status: false, message: 'test ldap connection failed' });
            }
           
           
            
        });
        //test connection for ldap on step1
        router.post('/getAgency', async (req, res) => {
            var ldapClient = require("ldapjs");
            var baseDN = req.body.baseDN; //"dc=dev,dc=rocketsoftware,dc=com"
            var ocInstanceName = req.body.InstanceName; //"wcMJ"
            var url = req.body.url;//"ldap://waldevbzmcj01.dev.rocketsoftware.com:389";
            var userDn = req.body.userDN; //"cn=admin,dc=dev,dc=rocketsoftware,dc=com";
            var password = Buffer.from(req.body.password, 'base64').toString('utf8'); //"rocket";
            var that = this;
			try {
                var client =  ldapClient.createClient({
                    url: url,
                    connectTimeout:10000,
                    tlsOptions:{ 'rejectUnauthorized': false}
                  });;
                
                
                client.addListener('error', function (error) {
                    that.log4import.getLogger().error(error.stack);
                    res.status(500).send({ status: false, message: 'test ldap connection failed' });
                });
            
                await client.bind(userDn, password, async function(err, res1) {
                    var configAreas = ["profile"];
                    var hasProfile = true;
                    let data = new Array();
                    for (const config of configAreas){
                        let rows ;
                        let filter = '(objectClass=*)';
                        try {
                                rows = await that.search(client,{
                                base: 'ocConfigArea='+config+',ocInstanceName='+ocInstanceName+',ocServerDomain=OpenConnect Servers,'+baseDN,
                                scope: 'sub', 
                                attributes: ['ocConfigName'],
                                attrsOnly: true,
                                paged: { pageSize:1500,pagePause:false },//'true', 
                                filter: filter
                            });
                        } catch (error) {
                            if(config=="profile"&&rows==undefined)
                            {
                                hasProfile = false;
                                that.log4import.getLogger().warn('ocConfigArea profile not found');
                            }
                        }

                        for (let key in rows) {
                            let ldapRow = rows[key];
                            if ( (ldapRow.ocConfigName != undefined) ) {
                                try {
                                    if(ldapRow.ocConfigName.indexOf('users/') >= 0 && ldapRow.ocConfigName.indexOf('@')>0) {
                                        let agecny = ldapRow.ocConfigName.substring(ldapRow.ocConfigName.indexOf('@')+1);
                                        if(agecny && !data.includes(agecny)) {
                                            data.push(agecny);
                                        }
                                    }
                                } catch (err) {
                                    that.log4import.getLogger().error(err.stack);
                                }
                            }
                        }
                        
                    }
                    if(!hasProfile)
                    {
                        that.log4import.getLogger().error('profile not exists');
                        if (client) {
                            client.destroy();
                        }
                        res.status(500).send({ status: false, message: 'profile not exists' });
                    }else{
                        that.log4import.getLogger().info("agency get successfully");
                        if (client) {
                            client.destroy();
                        }
                        res.status(200).send({ data:data, status: true, message: 'agency get successfully' });
                    }
                    
                })
            } catch (error) {
                that.log4import.getLogger().error(error.stack);
                if (client) {
                    client.destroy();
                }
                res.status(500).send({ status: false, message: 'get agency failed' });
            }
           
           
            
        });
        /**
         * check if it is for customer doitt
         */
        router.post('/isAgency', async (req, res) => { 
            var path = this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/configurations/agency.txt";
            if(fs.existsSync(path)) {
                res.status(200).send({ status: true, message: 'it is import by agency' });
            } else {
                res.status(200).send({ status: false, message: 'no agecny' });
                return;
            }
        });
        //result for import
        router.get('/res4import', async (req, res) => {
            let data =await this.getSummary();
           res.setHeader('Content-Type','application/json');
           res.send(data); 
            
        });
        router.get('/log4import', async (req, res) => {
            let data ={};
            var filename = req.query.filename;
            var path = this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/history/"+filename;
            if(fs.existsSync(path))
            {
				try{
                    path = Security.sanitizePath(path); // Ensure security
                }catch(e){
                    res.status(500).send('Illegal path');
					return;
                }
                var f = fs.createReadStream(path);
                res.writeHead(200, {
                    'Content-Type': 'application/force-download',
                    'Content-Disposition': 'attachment; filename='+filename
                });
                f.pipe(res);
            }else
            {
                res.setHeader('Content-Type','application/json');
                res.send(false); 
            }

        });
        router.get('/history4import', async (req, res) => {
            let data ={};
            var username = req.query.name;
            var filename = "history.txt";
            var path = this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/history/"+filename;
            if(fs.existsSync(path))
            {
                let objs = new Array();
                const allLineText = fs.readFileSync(path, "utf8");
                if (allLineText) {
                    var allLines = allLineText.split("\n");

                    for(let i=allLines.length-1; i>=0 ; i--) 
                        {
                            let obj = {};
                            var text = allLines[i];
                            var row = text.split("|");
                            obj.filename = row[0]!=undefined?row[0].trim():"";
                            obj.timestamp = row[1]!=undefined?row[1].trim():"";
                            obj.downloadfile = row[2]!=undefined?row[2].trim().replace('\r',''):"";
                            objs.push(obj);
                        }
                        
                    }
                    var status = objs.length>0 ? true:false;
                    res.setHeader('Content-Type','application/json');
                    res.send({data:objs,status:status}); 
            }else
            {
                res.setHeader('Content-Type','application/json');
                res.send({status: false}); 
            }

        });
        //import through by site of imporing
        router.post('/doAll', async (req, res) => {
            //control flow
            req.setTimeout(60 * 60 * 1000); // 60 minutes
            var method = req.query.method;
            let asy = require('async');
            var that = this;
            this.sesSucess = new Map();
            this.groupSucessCount = this.userSucessCount = 0;
            this.keymapSucessCount = this.attrSucessCount = this.hspSucessCount = 0;
            this.needToUpdScope = new Array();// reset this array when import or re-import
            asy.series({
                sessionCount:async function(done)
                {
                     let params = {};
                     params.dirkey = "admin_ses";
                     params.override = req.query.override;
                     try{
                         let res  = await that.doImportSession(params);
                      }catch(error){
                         that.log4import.getLogger().error('import global session error:'+ error);
                      }
                    
                },
                keymapCount:async function(done){
                    try{
                        let params = {};
                        params.dirkey = "admin_keymap";
                        params.override = req.query.override;
                        let res  = await that.doImportKeymap(params);
                    }catch(error){
                            that.log4import.getLogger().error('import keymap error:'+ error);
                    }
                       
                   },
                atmCount:async function(done){
                    try{
                        let params = {};
                        params.dirkey = "admin_atm";
                        params.override = req.query.override;
                        let res = await that.doImportAttribute(params);
                    }catch(error){
                            that.log4import.getLogger().error('import attibute error:'+ error);
                    }
                },
                hotspotCount:async function(done){
                    try{
                        let params = {};
                        params.dirkey = "admin_hsp";
                        params.override = req.query.override;
                        let res = await that.doImportHotspot(params);
                    }catch(error){
                            that.log4import.getLogger().error('import hotspot error:'+ error);
                    }
                },
                groupCount:async function(done){
                    try{
                        let params = {};
                        params.agency = req.body.agency || [];
                        params.override = req.query.override;
                        params.autogroup = req.query.autogroup;
                        var autogroup = params.autogroup;
                        if(params.agency && params.agency.length>0) {
                            let unchecked = params.agency.filter(e => e.checked == false);
                            if(unchecked.length === params.agency.length) { params.agency = [];} // if all agency is unchecked, set agency to null array.
                        }
                        if(autogroup=="true"||autogroup==true)
                        {
                            let groups  = await that.doImportGroup(params);
                            if(groups!=undefined)
                            return groups.size;
                        }
                             
                         }catch(error){
                             that.log4import.getLogger().error('insert group error:'+ error);
                         }
                    
                },
                userCount:async function(done){
                 try{
                     let params = {};
                     params.dirkey = "user";
                     params.override = req.query.override;
                     params.autogroup = req.query.autogroup;
                     let res  = await that.doImportUser(params);
 
                     }catch(error){
                         that.log4import.getLogger().error('import user error:'+ error);
                     }
                    
                },
                userAtmCount:async function(done){
                 try{
                     let params = {};
                     params.dirkey = "atm";
                     params.override = req.query.override;
                     let res = await that.doImportAttribute(params);
                 }catch(error){
                         that.log4import.getLogger().error('import user attibute error:'+ error);
                    }
                 },
                 userClickpadCount:async function(done){
                     try{
                         let params = {};
                         //params.dirkey = "admin_clk"; //there is no cfgdir/clk folder
                         //let para6 = await that.doImportClkpad(params);
                         params.dirkey = "clk";
                         params.override = req.query.override;
                         let res = await that.doImportClkpad(params);
                     }catch(error){
                             that.log4import.getLogger().error('import user clickpad error:'+ error);
                     }
                 },
                 userHotspotCount:async function(done){
                     try{
                         let params = {};
                         params.dirkey = "hsp";
                         params.override = req.query.override;
                         let res = await that.doImportHotspot(params);
                     }catch(error){
                             that.log4import.getLogger().error('import user hotspot error:'+ error);
                     }
                 },
                 userKeymapCount:async function(done){
                    try{
                        let params = {};
                        params.dirkey = "keymap";
                        params.keepfilext = true;
                        params.override = req.query.override;
                        let res  = await that.doImportKeymap(params);
                    }catch(error){
                            that.log4import.getLogger().error('import user keymap error:'+ error);
                    }
                       
                },
                 relation:async function(done){
                    try{
                        let params = {};
                        params.dirkey = "admin_ses";
                        params.override = req.query.override;
                        let res = await that.doImportRelation(params);
                    }catch(error){
                            that.log4import.getLogger().error('import relation error:'+ error);
                    }
                 }
            },async function(error,result){
                 let params = {};
                 params.filename = req.query.filename;
                 params.method = req.query.method;
                let data = await that.getSummary(params,result);
                if(data.summary!=undefined&&data.summary.length>0)
                {
                    res.status(200).send({data:data,status:true});
                }
                else
                {
                    res.status(500).send({ status: false });
                    return;
                }
            });
             
 
         });
     }

    asyncGetKeyboardId(data) {
        if (data.id) {
            return new Promise((resolve, reject) => resolve(data.id));
        }
        return this.utiles.ensureMapping('keyboard', data.terminalType, data.name);
    }

    readFilePromise(path, fileName, opts = 'utf8') {
        return new Promise((resolve, reject) => {
            if(!fs.existsSync(path)) {
                this.logger.info(`There is no default keyboard: ${fileName} in folder ${path}`);
                resolve(JSON.stringify([]));
            }
            fs.readFile(path+`/${fileName}`, opts, (err, data) => {
                if (err) reject(err)
                else resolve(data)
            })
        });
    }
    
    createDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    }

    //for private keyboard
    async setKeyboardPrivate(table,userLevelMap,params) {
        var that = this;
        var sessionKeyMap = await this.upgradeDataService.getWCdata("admin_keymap");
        var sesesonKM = JSON.parse(sessionKeyMap);
        var adminSes = await this.upgradeDataService.getWCdata("admin_ses");
        var adminSesData = JSON.parse(adminSes);
        let allUserKeymapArray = new Array();
        for(let key of Object.keys(userLevelMap)) 
        {
            let userLevelKM = {};
            userLevelKM = Object.assign({},userLevelMap[key]);
            if (userLevelKM.Keymap==undefined) {
                userLevelKM.Keymap = {};
            }
            let keyboard = {};
            
            var sname=key.split("-");
                if(sname!=undefined && sname.length<=1)
                {
                         keyboard.userId = sname[0].substring(0,sname[0].lastIndexOf("."));
                         var userName = sname[0];
                         const filterShared = {};
                         const accessGroups = await bzdb.select('group');
                         const preSessions = await bzdb.select('sessionShared', filterShared);
                         const sessions = preSessions.rowCount > 0 ? preSessions.data.map(d => d.id) : [];
                         (accessGroups.data || []).forEach(group => {
                             const inGroup = ((group.internalUsers || []).filter(userObj => (userObj.userId || '').toLowerCase() === userName)).length > 0;
                               if (inGroup || (group.id || group.groupName) === 'Default Group') {
                                     sessions.push(...group.sessions);
                                            }
                         });
                         for(let o of Object.keys(sessions)) 
                            {
                                filterShared.id = sessions[o];
                                const recordSet = await bzdb.select('sessionShared', filterShared);
                                let merged = {};
                                if(recordSet.rowCount>0)
                                    {
                                        let ses_id = recordSet.data[0].id;
                                        let ses_id_array = ses_id.split("-");
                                        if(ses_id_array.length>=2)
                                        {
                                            ses_id = ses_id_array[1];//if session name like Default 3270 Session - WC0000013  ,give webconnect id WC0000013
                                        }

                                        let ses = adminSesData[ses_id];
                                        let endwith = userName.substring(userName.lastIndexOf("."));
                                        let uName = userName.substring(0,userName.lastIndexOf("."));
                                        let user_ses = userLevelMap[uName+"-"+ses_id+endwith];

                                        let user_session_endwith = "";
                                        let hasUserLevelKM = true;
                                        if(recordSet.data[0].type.indexOf("3270")>=0) user_session_endwith = ".km3";
                                        if(recordSet.data[0].type.indexOf("5250")>=0) user_session_endwith = ".km5";
                                        if(recordSet.data[0].type.indexOf("VT")>=0) user_session_endwith = ".kmV";
                                        if(userLevelMap[uName+user_session_endwith] == undefined)
                                        {//only have user's session level keymap file ,such as liw-WC0000010.kmV if there is no liw.kmV
                                            hasUserLevelKM = false;
                                            user_ses = userLevelMap[uName+"-"+ses_id+user_session_endwith];
                                            if(user_ses==undefined) hasUserLevelKM = true;
                                        }
                                        let userSessionLevelKM = {};
                                        if(user_ses!=undefined)
                                        {// fix for JSTE-7246, User-Session level Keyboard change should be inherit User level Keyboard change
                                            userSessionLevelKM.Keymap = Object.assign({},userLevelKM.Keymap,user_ses.Keymap);
                                            userSessionLevelKM.Keymap.Emtype=ses.Configuration.Emulation;
                                        }
                                        if(ses==undefined) continue;
                                        if(hasUserLevelKM){
                                            if(endwith==".km3" && recordSet.data[0].type.indexOf("3270")<0) continue;
                                            if(endwith==".km5" && recordSet.data[0].type.indexOf("5250")<0) continue;
                                            if(endwith==".kmV" && recordSet.data[0].type.indexOf("VT")<0) continue;
                                        }
                                        
                                            let mergedMap = {};
                                            mergedMap.Keymap = {};
                                            if(recordSet.data[0].type.indexOf("3270")>=0)
                                            {
                                                    
                                                keyboard.type = '3270';
                                                keyboard.terminalType = '3270';
                                                mergedMap.Keymap.Emtype = '3270';
                                                userLevelKM.Keymap.Emtype = '3270';
                                             }
                                             if(recordSet.data[0].type.indexOf("5250")>=0)
                                                {
                                                    mergedMap.Keymap.Emtype = '5250';
                                                    userLevelKM.Keymap.Emtype = '5250';
                                                    keyboard.type = '5250';
                                                    keyboard.terminalType = '5250';
                                                }
                                                if(recordSet.data[0].type.indexOf("VT")>=0)
                                                {
                                                    
                                                    keyboard.type = 'VT';
                                                    keyboard.terminalType = 'VT';
                                                    mergedMap.Keymap.Emtype = 'VT';
                                                    userLevelKM.Keymap.Emtype = 'VT';
                                                }
                                                
                                                if(mergedMap!=undefined && mergedMap.Keymap!=undefined)
                                                {//merge session+server+user level keymap
                                                    if(user_ses!=undefined){
                                                        // fix for JSTE-7173, User level and User session level keyboard should be independent, not inherited
                                                        merged.Keymap = Object.assign({},mergedMap.Keymap,user_ses.Keymap);
                                                    }else{
                                                        merged.Keymap = Object.assign({},mergedMap.Keymap,userLevelKM.Keymap);
                                                    }
                                                    
                                                }else{
                                                    merged.Keymap = Object.assign({},userLevelKM.Keymap);
                                                }
                                                if(userSessionLevelKM!=undefined && userSessionLevelKM.Keymap)
                                                {
                                                    merged.Keymap = Object.assign({},merged.Keymap,userSessionLevelKM.Keymap);
                                                }
                                                if(recordSet.data[0].type.indexOf("3287")>=0)
                                                {
                                                    keyboard.type = '3287';
                                                    keyboard.terminalType = '3287';
                                                    merged.Keymap = Object.assign({},userLevelKM.Keymap);
                                                    merged.Keymap.Emtype = '3270';
                                                }
                                                var sessionId = recordSet.data[0].id;
                                                var kbmapid=recordSet.data[0].keyboardMappingId;
                                                if(kbmapid==undefined||kbmapid.length<=0)
                                                {
                                                    kbmapid = keyboard.userId+'ÿ'+sessionId+"_keyboardMapping";
                                                }
                                                keyboard.id = kbmapid;
                                                var override = params.override;
                                                if( override == "false" || override == false ) { continue; }
                                            }
                                            let result =await that.saveUserKeyboardMapping(table,keyboard,merged);
                                            allUserKeymapArray.push(result);
                            }
                }    
        }
        if(allUserKeymapArray!=undefined && allUserKeymapArray.length>0)
        {
            let resultAllUserKeymap = await bzdb.bulkLoad(table, allUserKeymapArray);
            if(resultAllUserKeymap.status) {
                that.log4import.getLogger().info("update or insert to "+table+"  successfully");
            }
        }
        
         return true;   
    }
    async saveKeyboardMapping(table,keyboardSrc,keys) {
        var that = this;
        let keyboard = Object.assign({},keyboardSrc);
        const type = keys.Keymap.Emtype;
        const fileName = `default${type}KeyboardMapping4WC.json`;
        let dataFromFile = await that.readFilePromise(that.productDir + DEFAULT_PATH, fileName);
        var defaultJson = JSON.parse(dataFromFile);
        keyboard.keyboardMapping = defaultJson.keyboardMapping ;
        let autoSkipBackspace = true;
        if(type=="3270") autoSkipBackspace = false;
        keyboard.keyboardOptions={
            "autoResetOptions": 
        {
            "isAutoReset": false,
            "isAutoTab": false,
            "isImmediate": false,
                "isPressNextKey": true
        },
            "rapidLeftRight": true,
            "destructiveBackspace": false,
            "autoSkipBackspace": autoSkipBackspace
        };
        keyboard.keyboardLanguage=[{
            "name": "US Standard", 
                "value": "English (United States)", 
            "altGrOn": false, 
            "lang": "en-us"
        }];
        for(let equalLeftVal of Object.keys(keys.Keymap)) 
        {
            let wcValue = keys.Keymap[equalLeftVal];
            var wckey = equalLeftVal.substring(equalLeftVal.indexOf("(")+1,equalLeftVal.indexOf(")"));
            if(this.wc2Key[wckey]!=undefined)
            {
                let tempkey = this.wc2Key[wckey];
                equalLeftVal = equalLeftVal.replace("d("+wckey+")",tempkey);;
                wckey = tempkey.substring(tempkey.indexOf("(")+1,tempkey.indexOf(")"));
            }
            if(wcValue!=undefined && (wcValue.indexOf("\\00a2")>=0 ||wcValue.indexOf("\\00a6")>=0 ||wcValue.indexOf("\\00AC")>=0))
            {
                wcValue = wcValue.replace("\\00a2","¢").replace("\\00a6","¦").replace("\\00AC","¬");
            }
            if(wcValue!=undefined && (wcValue.indexOf("\\005b")>=0 ||wcValue.indexOf("\\005d")>=0 ||wcValue.indexOf("\\005e")>=0))
            {
                wcValue = wcValue.replace("\\005b","¢").replace("\\005d","¦").replace("\\005e","¬");
            }
            if(wckey.length<=0) continue;
                for(let i=0; i< keyboard.keyboardMapping.length; i++) 
                    {
                        let RTEkey = keyboard.keyboardMapping[i];
                        var hasMatched = await that.hasMatched(RTEkey,wckey);
                        if(hasMatched)
                        {
                            var rteValue = "";
                            var actionType = null;
                            if(wcValue.indexOf("c(")>=0 || wcValue.indexOf("s(")>=0)
                            {
                                rteValue = wcValue.substring(wcValue.indexOf("(")+1,wcValue.indexOf(")"));
                            }
                            if(wcValue.indexOf("f(")>=0)
                            {
                                rteValue = wcValue.substring(wcValue.indexOf("(")+1,wcValue.indexOf(")"));
                                if (keyboard.type == "3270")
                                    rteValue = this.wc2rte3270Funcs[rteValue];
                                else if (keyboard.type == "5250")
                                    rteValue = this.wc2rte5250Funcs[rteValue];
                                else if (keyboard.type == "VT")
                                    rteValue = this.wc2rteVTFuncs[rteValue];
                                else
                                    rteValue = this.wc2rte3270Funcs[rteValue];
                                if(rteValue==undefined||rteValue.length<=0)
                                continue;
                            }
                            if(wcValue.indexOf("c(")>=0 || wcValue.indexOf("s(")>=0)
                            {
                                actionType = 'KEYMAP_TYPE_STRING';
                            }
                            if(wcValue.indexOf("f(")>=0)
                            {
                                actionType = `KEYMAP_TYPE_${type}FUNCTION`;
                            }
                            var arr = equalLeftVal.toString().split("+"); 
                            var j = 0;//normal
                            if(arr.length>3)
                            {
                                j=7;//ctrl+alt+shift
                            }else if(arr.length>2)
                            {
                                if((arr[2].toLocaleLowerCase()=="ctrl"&&arr[1].toLocaleLowerCase()=="alt")||
                                    (arr[1].toLocaleLowerCase()=="ctrl"&&arr[2].toLocaleLowerCase()=="alt"))
                                {
                                    j=4;//ctrl+alt
                                }else if((arr[2].toLocaleLowerCase()=="ctrl"&&arr[1].toLocaleLowerCase()=="shift")||
                                        (arr[1].toLocaleLowerCase()=="ctrl"&&arr[2].toLocaleLowerCase()=="shift"))
                                        {
                                            j=5;//ctrl+shift
                                        }else if((arr[2].toLocaleLowerCase()=="alt"&&arr[1].toLocaleLowerCase()=="shift")||
                                                (arr[1].toLocaleLowerCase()=="alt"&&arr[2].toLocaleLowerCase()=="shift"))
                                        {
                                            j=6;//alt+shift
                                        }
                            }else if(arr.length>1)   
                            {
                                if(arr[1].toLocaleLowerCase()=="shift")
                                {
                                    j = 1;//shift
                                                
                                }else if(arr[1].toLocaleLowerCase()=="ctrl")
                                {
                                    j=2;//ctrl
                                                
                                }else if(arr[1].toLocaleLowerCase()=="alt")
                                {
                                    j=3;//alt
                                                
                                }
                                                
                            }
                            if(wcValue.indexOf("m(")>=0)
                            {//cover macro
                                rteValue = keyboard.keyboardMapping[i].mapping[j].value;
                                actionType = keyboard.keyboardMapping[i].mapping[j].type;
                            }
                            keyboard.keyboardMapping[i].mapping[j].value=rteValue;
                            keyboard.keyboardMapping[i].mapping[j].type=actionType;
                                            
                        }
                    }
                            
        }
        this.log4import.getLogger().info(' update or insert '+'keymap id: '+keyboard.id+'  successfully');
        return keyboard;
        
    }
    //save user's keyboard mapping
    async saveUserKeyboardMapping(table,keyboardSrc,keys) {
        var that = this;
        let keyboard = Object.assign({},keyboardSrc);
        const type = keys.Keymap.Emtype;
        const fileName = `default${type}KeyboardMapping4WC.json`;
        let dataFromFile = await that.readFilePromise(that.productDir + DEFAULT_PATH, fileName);
        var defaultJson = JSON.parse(dataFromFile);
        let defaultMapping =  defaultJson.keyboardMapping ;//keyboard.keyboardMapping
        let autoSkipBackspace = true;
        if(type=="3270") autoSkipBackspace = false;
        keyboard.keyboardOptions={
            "autoResetOptions": 
        {
            "isAutoReset": false,
            "isAutoTab": false,
            "isImmediate": false,
                "isPressNextKey": true
        },
            "rapidLeftRight": true,
            "destructiveBackspace": false,
            "autoSkipBackspace": autoSkipBackspace
        };
        keyboard.keyboardLanguage=[{
            "name": "US Standard", 
                "value": "English (United States)", 
            "altGrOn": false, 
            "lang": "en-us"
        }];
        keyboard.keyboardMapping = new Array();
        for(let equalLeftVal of Object.keys(keys.Keymap)) 
        {
            let wcValue = keys.Keymap[equalLeftVal];
            var wckey = equalLeftVal.substring(equalLeftVal.indexOf("(")+1,equalLeftVal.indexOf(")"));
            if(this.wc2Key[wckey]!=undefined)
            {
                let tempkey = this.wc2Key[wckey];
                equalLeftVal = equalLeftVal.replace("d("+wckey+")",tempkey);;
                wckey = tempkey.substring(tempkey.indexOf("(")+1,tempkey.indexOf(")"));
            }
            if(wcValue!=undefined && (wcValue.indexOf("\\00a2")>=0 ||wcValue.indexOf("\\00a6")>=0 ||wcValue.indexOf("\\00AC")>=0))
            {
                wcValue = wcValue.replace("\\00a2","¢").replace("\\00a6","¦").replace("\\00AC","¬");
            }
            if(wcValue!=undefined && (wcValue.indexOf("\\005b")>=0 ||wcValue.indexOf("\\005d")>=0 ||wcValue.indexOf("\\005e")>=0))
            {
                wcValue = wcValue.replace("\\005b","¢").replace("\\005d","¦").replace("\\005e","¬");
            }
            if(wckey.length<=0) continue;
                for(let i=0; i< defaultMapping.length; i++) 
                    {
                        let RTEkey = defaultMapping[i];
                        var hasMatched = await that.hasMatched(RTEkey,wckey);
                        if(hasMatched)
                        {
                            let customizedKeymap = {};
                            customizedKeymap.mapping = [null,null,null,null,null,null,null,null];
                            var rteValue = "";
                            var actionType = null;
                            if(wcValue.indexOf("c(")>=0 || wcValue.indexOf("s(")>=0)
                            {
                                rteValue = wcValue.substring(wcValue.indexOf("(")+1,wcValue.indexOf(")"));
                            }
                            if(wcValue.indexOf("f(")>=0)
                            {
                                rteValue = wcValue.substring(wcValue.indexOf("(")+1,wcValue.indexOf(")"));
                                if (keyboard.type == "3270")
                                    rteValue = this.wc2rte3270Funcs[rteValue];
                                else if (keyboard.type == "5250")
                                    rteValue = this.wc2rte5250Funcs[rteValue];
                                else if (keyboard.type == "VT")
                                    rteValue = this.wc2rteVTFuncs[rteValue];
                                else
                                    rteValue = this.wc2rte3270Funcs[rteValue];
                                if(rteValue==undefined||rteValue.length<=0)
                                continue;
                            }
                            if(wcValue.indexOf("c(")>=0 || wcValue.indexOf("s(")>=0)
                            {
                                actionType = 'KEYMAP_TYPE_STRING';
                            }
                            if(wcValue.indexOf("f(")>=0)
                            {
                                actionType = `KEYMAP_TYPE_${type}FUNCTION`;
                            }
                            var arr = equalLeftVal.toString().split("+"); 
                            var j = 0;//normal
                            if(arr.length>3)
                            {
                                j=7;//ctrl+alt+shift
                            }else if(arr.length>2)
                            {
                                if((arr[2].toLocaleLowerCase()=="ctrl"&&arr[1].toLocaleLowerCase()=="alt")||
                                    (arr[1].toLocaleLowerCase()=="ctrl"&&arr[2].toLocaleLowerCase()=="alt"))
                                {
                                    j=4;//ctrl+alt
                                }else if((arr[2].toLocaleLowerCase()=="ctrl"&&arr[1].toLocaleLowerCase()=="shift")||
                                        (arr[1].toLocaleLowerCase()=="ctrl"&&arr[2].toLocaleLowerCase()=="shift"))
                                        {
                                            j=5;//ctrl+shift
                                        }else if((arr[2].toLocaleLowerCase()=="alt"&&arr[1].toLocaleLowerCase()=="shift")||
                                                (arr[1].toLocaleLowerCase()=="alt"&&arr[2].toLocaleLowerCase()=="shift"))
                                        {
                                            j=6;//alt+shift
                                        }
                            }else if(arr.length>1)   
                            {
                                if(arr[1].toLocaleLowerCase()=="shift")
                                {
                                    j = 1;//shift
                                                
                                }else if(arr[1].toLocaleLowerCase()=="ctrl")
                                {
                                    j=2;//ctrl
                                                
                                }else if(arr[1].toLocaleLowerCase()=="alt")
                                {
                                    j=3;//alt
                                                
                                }
                                                
                            }
                            if(wcValue.indexOf("m(")>=0)
                            {//cover macro
                                rteValue = defaultMapping[i].mapping[j].value;
                                actionType = defaultMapping[i].mapping[j].type;
                            }
                            
                            if(customizedKeymap.mapping[j]==null||customizedKeymap.mapping[j]==undefined)
                            {
                                customizedKeymap.mapping[j] = {};
                            }
                            customizedKeymap.key = RTEkey.key;
                            customizedKeymap.mapping[j].value=rteValue;
                            customizedKeymap.mapping[j].type=actionType;
                            customizedKeymap.mapping[j].isCustomize = true;  
                            keyboard.keyboardMapping.push(customizedKeymap);
                        }
                    }
                          
        }
        this.log4import.getLogger().info(' update or insert '+'keymap id: '+keyboard.id+'  successfully');
        return keyboard;
        
    }

    TypeToExt(Type, Ext) {
        if (Type == '3270')
            return Ext + "3";
        else if (Type == '5250')
            return Ext + "5";
        else if (Type == 'VT')
            return Ext + "V";
    }

    getTypeFromExt(key,Ext) {
        if (key.endsWith(Ext+"3")) return "3270";
        else if (key.endsWith(Ext+"5")) return "5250";
        else if (key.endsWith(Ext+"V")) return "VT";
        return "";
    }

    //for private click pads
    async setClkpadPrivate(table,wcclickpads,params) {
        var that = this;
        var adminSes = await this.upgradeDataService.getWCdata("admin_ses");
        var adminSesData = JSON.parse(adminSes);
        let allUserClkpadArray = new Array();
        for(let key of Object.keys(wcclickpads)) 
        {
            let wcclickpad = wcclickpads[key];
            var launchpad = {};
            let filename = key.substring(0,key.lastIndexOf("."));
            if (filename.length==0)
                filename = key.substring(0,key.length);
            let Type = that.getTypeFromExt(key,".ck");

            var sname=filename.split("-");
            var lname ="";
            let Special = false;
            if(sname!=undefined && sname.length>1) {
                //Check to see if no user level profile exists so that the session level profiles are not skipped
                //example (liw-WC0000342.cl5 exists, but no liw.cl5)
                let test = sname[0] + that.TypeToExt(Type, ".cl");
                if (wcclickpads[test]==undefined) {
                    Special = true;
                }
            }
            if((sname!=undefined && sname.length<=1) || (Special == true))
            {
                launchpad.userId = sname[0];
                var userName = sname[0];
                const filterShared = {};
                const accessGroups = await bzdb.select('group');
                const preSessions = await bzdb.select('sessionShared', filterShared);
                const sessions = preSessions.rowCount > 0 ? preSessions.data.map(d => d.id) : [];
                (accessGroups.data || []).forEach(group => {
                    const inGroup = ((group.internalUsers || []).filter(userObj => (userObj.userId || '').toLowerCase() === userName)).length > 0;
                    if (inGroup || (group.id || group.groupName) === 'Default Group') {
                        sessions.push(...group.sessions);
                    }
                });
                for(let o of Object.keys(sessions)) 
                {
                    filterShared.id = sessions[o];
                    const recordSet = await bzdb.select('sessionShared', filterShared);
                    if(recordSet.rowCount>0)
                    {
                        let ses_id = recordSet.data[0].id;
                        let ses_id_array = ses_id.split("-");
                        if(ses_id_array.length>=2)
                        {
                            ses_id = ses_id_array[1];//if session name like Default 3270 Session - WC0000013  ,give webconnect id WC0000013
                        }

                        let ses = adminSesData[ses_id];
                        if(ses==undefined) {
                            //console.log("adminSesData does not exist");
                            continue;
                        }

                        if((recordSet.data[0].type.indexOf("3270")>=0) && (Type != '3270')) continue;
                        if((recordSet.data[0].type.indexOf("5250")>=0) && (Type != '5250')) continue;
                        if((recordSet.data[0].type.indexOf("VT")>=0) && (Type != 'VT')) continue;
                        
                        let user_ses = wcclickpads[userName+"-"+ses_id + that.TypeToExt(Type, ".ck")];
                        if(user_ses!=undefined) {
                            //console.log("user_ses defined");
                        }
                        else
                        {
                            if (Special==true) { //skip, there is no custom user level for this user
                                continue;
                            }
                            user_ses = wcclickpad;
                            //console.log("user_ses not defined");
                        }

                        var sessionId = recordSet.data[0].id;
                        var prefmapid=recordSet.data[0].launchpadId;
                        if(prefmapid==undefined||prefmapid.length<=0)
                        {
                            prefmapid = launchpad.userId+'ÿ'+sessionId+"_launchpad";
                        }
                        launchpad.id = prefmapid;
                        const rs = await bzdb.select(table, {id: prefmapid});
                        if(rs.rowCount>0)
                        {
                            var name = rs.data[0].name;
                            launchpad.name = name;
                            var override = params.override;
							if( override == "false" || override == false ) { continue; }
                        }
                        let result = await that.saveClkpadMapping(table,launchpad,user_ses,Type,sessionId);
                        allUserClkpadArray.push(result);
                    }
                }
            }
        }
        if(allUserClkpadArray!=undefined && allUserClkpadArray.length>0)
        {
            let allUserClkpadRep = await bzdb.bulkLoad(table, allUserClkpadArray);
            if(allUserClkpadRep.status) {
                that.log4import.getLogger().info("update private click pads successful");
            }else
            {
                if (allUserClkpadRep)
                    that.log4import.getLogger().info('update private click pads failed: ' + allUserClkpadRep.status);
                else
                    that.log4import.getLogger().info('update private click pads failed: ' + 'unknown'); 
                return false;
            }
        }
        return true;
    }

    async saveClkpadMapping(table,launchpadSrc,wcclkpad,Type,sessionId) {
        var that = this;
        let launchpad = Object.assign({},launchpadSrc);
        let prefs = {};
        let prefsValues = {};

        let prefmapid = launchpad.userId+'ÿ'+sessionId+"_preferences";
        const rs = await bzdb.select('preferencePrivate', {id: prefmapid});
        if (rs.rowCount>0) {
            prefsValues = rs.data[0];
        }
        else
        {
            //no existing preferencePrivate
            that.setdefaultPrefs(prefsValues,Type);
        }

        prefs = Object.assign({}, prefs, prefsValues);

        that.convertClkPads(prefs,launchpad,wcclkpad,Type);

        return launchpad;
    }

    //for private attr colors
    async setAttrColorsPrivate(table,attribs,colorsAdmin,colorsUser,params) {
        var that = this;
        var adminSes = await this.upgradeDataService.getWCdata("admin_ses");
        var adminSesData = JSON.parse(adminSes);
        var adminAttrib = await this.upgradeDataService.getWCdata("admin_atm");
        var adminAttribData = JSON.parse(adminAttrib);
        let result = {};
        //If a user color file exists (user or user-session) but no user attrib file exists then add an entry into the attribs[]
        for (var colorKey in colorsUser) {
            let filename = colorKey.substring(0,colorKey.lastIndexOf("."));
            if (filename.length==0)
                filename = colorKey.substring(0,colorKey.length);
            let Type = that.getTypeFromExt(colorKey,".cm");
            let attrfilename = filename + that.TypeToExt(Type, ".at");
            let sname=filename.split("-");
            if (attribs[attrfilename]) { //attribute of user or user-session exists, continue
                continue;
            }
            if (sname.length > 1) {
                attrfilename = sname[0] + that.TypeToExt(Type, ".at");
                if (attribs[attrfilename]) { //attribute of user exists, continue
                    continue;
                }
            }

            //At this point no attribute file of the user exists

            //if user-session.at then
                //use WCxxxxxxx.atm to add user-session.at?
                //if not exists use defX

            //else if user.at then
                //use defX.atm to add user.at?

            let sesName = "";
            if (sname.length > 1) {
                sesName = sname[1];
                attrfilename = filename + that.TypeToExt(Type, ".at");
                if (adminAttribData[sesName] ) {
                    let copy = adminAttribData[sesName];
                    attribs[attrfilename] = copy;
                    continue;
                }
            }

            if (Type == '3270') sesName = "def3270";
            else if (Type == '5250') sesName = "def5250";
            else if (Type == 'VT') sesName = "defvt";

            attrfilename = filename + that.TypeToExt(Type, ".at");
            if (adminAttribData[sesName] ) {
                let copy = adminAttribData[sesName];
                attribs[attrfilename] = copy;
                continue;
            }
        }
        let allUserAttmArray = new Array();
        for(let key of Object.keys(attribs)) 
        {
            let attrib = attribs[key];
            var prefs = {};
            let filename = key.substring(0,key.lastIndexOf("."));
            if (filename.length==0)
                filename = key.substring(0,key.length);
            let Type = that.getTypeFromExt(key,".at");

            var sname=filename.split("-");
            var lname ="";
            let Special = false;
            if(sname!=undefined && sname.length>1) {
                //Check to see if no user level profile exists so that the session level profiles are not skipped
                //example (liw-WC0000342.at5 exists, but no liw.at5)
                let test = sname[0] + that.TypeToExt(Type, ".at");
                if (attribs[test]==undefined) {
                    Special = true;
                }
            }
            if((sname!=undefined && sname.length<=1) || (Special == true))
            {
                prefs.userId = sname[0];
                var userName = sname[0];
                const filterShared = {};
                const accessGroups = await bzdb.select('group');
                const preSessions = await bzdb.select('sessionShared', filterShared);
                const sessions = preSessions.rowCount > 0 ? preSessions.data.map(d => d.id) : [];
                (accessGroups.data || []).forEach(group => {
                    const inGroup = ((group.internalUsers || []).filter(userObj => (userObj.userId || '').toLowerCase() === userName)).length > 0;
                    if (inGroup || (group.id || group.groupName) === 'Default Group') {
                        sessions.push(...group.sessions);
                    }
                });
                for(let o of Object.keys(sessions)) 
                {
                    filterShared.id = sessions[o];
                    const recordSet = await bzdb.select('sessionShared', filterShared);
                    if(recordSet.rowCount>0)
                    {
                        let ses_id = recordSet.data[0].id;
                        let ses_id_array = ses_id.split("-");
                        if(ses_id_array.length>=2)
                        {
                            ses_id = ses_id_array[1];//if session name like Default 3270 Session - WC0000013  ,give webconnect id WC0000013
                        }

                        let ses = adminSesData[ses_id];
                        if(ses==undefined) {
                            //console.log("adminSesData does not exist");
                            continue;
                        }

                        if((recordSet.data[0].type.indexOf("3270")>=0) && (Type != '3270')) continue;
                        if((recordSet.data[0].type.indexOf("5250")>=0) && (Type != '5250')) continue;
                        if((recordSet.data[0].type.indexOf("VT")>=0) && (Type != 'VT')) continue;
                        if(recordSet.data[0].type.indexOf("3287")>=0) continue;

                        let user_ses = attribs[userName+"-"+ses_id + that.TypeToExt(Type, ".at")];
                        if(user_ses!=undefined) {
                            //console.log("user_ses defined");
                        }
                        else
                        {
                            if (Special==true) { //skip, there is no custom user level for this user
                                continue;
                            }
                            user_ses = attrib;
                            //console.log("user_ses not defined");
                        }

                        //Check for color
                        //  user-session
                        //  user
                        //  default (def3270.at3)
                        let color = colorsUser[userName+"-"+ses_id+that.TypeToExt(Type, ".cm")];
                        if(color!=undefined) {
                            //console.log("user session color defined");
                        }
                        else{
                            color = colorsUser[userName+that.TypeToExt(Type, ".cm")];
                            if (color!=undefined) {
                                //console.log("user color defined");
                            }
                            else
                            {
                                //console.log("use default colors");
                                color = colorsAdmin[ses_id];
                                if (color!=undefined) {
                                    //console.log("session color defined");
                                }
                                else
                                {
                                    //console.log("use global default colors");
                                    let defaultColor = '';
                                    if (Type == '3270')
                                        defaultColor = "def3270";
                                    else if (Type == '5250')
                                        defaultColor = "def5250";
                                    else if (Type == 'VT')
                                        defaultColor = "defvt";
                                    color = colorsAdmin[defaultColor];
                                }
                            }
                        }
                        
                        var sessionId = recordSet.data[0].id;
                        var prefmapid=recordSet.data[0].preferencesId;
                        if(prefmapid==undefined||prefmapid.length<=0)
                        {
                            prefmapid = prefs.userId+'ÿ'+sessionId+"_preferences";
                        }
                        prefs.id = prefmapid;
                        const rs = await bzdb.select(table, {id: prefmapid});
                        if(rs.rowCount>0)
                        {
                            var name = rs.data[0].name;
                            prefs.name = name;
                            var override = params.override;
							if( override == "false" || override == false ) { continue; }
                        }
                        result = await that.saveAttrColorsMapping(table,prefs,user_ses,color,Type);
                        allUserAttmArray.push(result);
                    }
                }
            }
        }
        if(allUserAttmArray!=undefined && allUserAttmArray.length>0)
        {
            let resultAllUserAttm = await bzdb.bulkLoad(table, allUserAttmArray);
            if(resultAllUserAttm && resultAllUserAttm.status) {
                that.log4import.getLogger().info("update private attr colors successful");
                return true;
            }else
            {
                if (resultAllUserAttm)
                    that.log4import.getLogger().info('update private attr colors failed: ' + resultAllUserAttm.status);
                else
                    that.log4import.getLogger().info('update private attr colors failed: ' + 'unknown'); 
                return false;
            }
        }
        return result;
    }

    async saveAttrColorsMapping(table,prefsSrc,attrib,color,bType) {
        var that = this;
        let prefs = Object.assign({},prefsSrc);

        that.setdefaultPrefs(prefs,bType);
        that.convertAttrColors(prefs,attrib,color,bType);

        return prefs;
    }

    //for private hotspot
    async setHotSpotPrivate(table,wchotspots,params) {
        var that = this;
        var adminSes = await this.upgradeDataService.getWCdata("admin_ses");
        var adminSesData = JSON.parse(adminSes);
        let allUserHotspotArray = new Array();
        for(let key of Object.keys(wchotspots)) 
        {
            let wchotspot = wchotspots[key];
            var hotspot = {};
            let filename = key.substring(0,key.lastIndexOf("."));
            if (filename.length==0)
                filename = key.substring(0,key.length);
            let Type = that.getTypeFromExt(key,".hs");

            var sname=filename.split("-");
            var lname ="";
            let Special = false;
            if(sname!=undefined && sname.length>1) {
                //Check to see if no user level profile exists so that the session level profiles are not skipped
                //example (liw-WC0000342.hs5 exists, but no liw.hs5)
                let test = sname[0] + that.TypeToExt(Type, ".hs");
                if (wchotspots[test]==undefined) {
                    Special = true;
                }
            }
            if((sname!=undefined && sname.length<=1) || (Special == true))
            {
                hotspot.userId = sname[0];
                var userName = sname[0];
                const filterShared = {};
                const accessGroups = await bzdb.select('group');
                const preSessions = await bzdb.select('sessionShared', filterShared);
                const sessions = preSessions.rowCount > 0 ? preSessions.data.map(d => d.id) : [];
                (accessGroups.data || []).forEach(group => {
                    const inGroup = ((group.internalUsers || []).filter(userObj => (userObj.userId || '').toLowerCase() === userName)).length > 0;
                    if (inGroup || (group.id || group.groupName) === 'Default Group') {
                        sessions.push(...group.sessions);
                    }
                });
                for(let o of Object.keys(sessions)) 
                {
                    filterShared.id = sessions[o];
                    const recordSet = await bzdb.select('sessionShared', filterShared);
                    if(recordSet.rowCount>0)
                    {
                        let ses_id = recordSet.data[0].id;
                        let ses_id_array = ses_id.split("-");
                        if(ses_id_array.length>=2)
                        {
                            ses_id = ses_id_array[1];//if session name like Default 3270 Session - WC0000013  ,give webconnect id WC0000013
                        }

                        let ses = adminSesData[ses_id];
                        if(ses==undefined) {
                            //console.log("adminSesData does not exist");
                            continue;
                        }

                        if((recordSet.data[0].type.indexOf("3270")>=0) && (Type != '3270')) continue;
                        if((recordSet.data[0].type.indexOf("5250")>=0) && (Type != '5250')) continue;
                        if((recordSet.data[0].type.indexOf("VT")>=0) && (Type != 'VT')) continue;

                        let user_ses = wchotspots[userName+"-"+ses_id + that.TypeToExt(Type, ".hs")];
                        if(user_ses!=undefined) {
                            //console.log("user_ses defined");
                        }
                        else
                        {
                            if (Special==true) { //skip, there is no custom user level for this user
                                continue;
                            }
                            user_ses = wchotspot;
                            //console.log("user_ses not defined");
                        }

                        var sessionId = recordSet.data[0].id;
                        var prefmapid=recordSet.data[0].hotspotsId;
                        if(prefmapid==undefined||prefmapid.length<=0)
                        {
                            prefmapid = hotspot.userId+'ÿ'+sessionId+"_hotspots";
                        }
                        hotspot.id = prefmapid;
                        const rs = await bzdb.select(table, {id: prefmapid});
                        if(rs.rowCount>0)
                        {
                            var name = rs.data[0].name;
                            hotspot.name = name;
                            var override = params.override;
							if( override == "false" || override == false ) { continue; }
                        }
                        let result = await that.saveHotSpotMapping(table,hotspot,user_ses,Type,sessionId);
                        allUserHotspotArray.push(result);
                    }
                }
            } 
            
        }
        if(allUserHotspotArray!=undefined && allUserHotspotArray.length>0)
        {
            let allUserHotspotRep = await bzdb.bulkLoad(table, allUserHotspotArray);
            if(allUserHotspotRep.status) {
                that.log4import.getLogger().info("update private hotspot successfully");
            }else
            {
                if (allUserHotspotRep)
                    that.log4import.getLogger().info('update private hotspot failed: ' + allUserHotspotRep.status);
                else
                    that.log4import.getLogger().info('update private hotspot failed: ' + 'unknown'); 
                return false;
            }
        }
        return true;
    }

    async saveHotSpotMapping(table,hotspotSrc,wchotspot,sessionId) {
        let hotspot = Object.assign({},hotspotSrc);
        
        let wc2rteFuncs = {};
        if (wchotspot.Configuration.Emulation === "3270") {
            wc2rteFuncs = this.wc2rte3270Funcs;
        }
        else if (wchotspot.Configuration.Emulation === "5250") {
            wc2rteFuncs = this.wc2rte5250Funcs;
        }

        hotspot.hotspotDefs = [];
        for (let key2 in wchotspot.HotSpots) {
            let hs = wchotspot.HotSpots[key2];
            let rteFunc = "";
            let rteHS = {};
            if(wc2rteFuncs[hs.toLowerCase()] != undefined) {
                rteFunc = wc2rteFuncs[hs.toLowerCase()];
                if ( rteFunc != '') {
                    rteHS["textToMatch"] = key2;
                    rteHS["caseSensitive"] = true;
                    rteHS["terminateWithSpace"] = false;
                    if (wchotspot.Configuration.Emulation === "3270") {
                        rteHS["actionType"] = "KEYMAP_TYPE_3270FUNCTION";
                    }
                    else {
                        rteHS["actionType"] = "KEYMAP_TYPE_5250FUNCTION";
                    }
                    rteHS["actionValue"] = "<" + rteFunc + ">";
                    hotspot.hotspotDefs.push(rteHS);
                }
            }
        }
        return hotspot;
        
    }
                   
     initLogger() {   
        var log4js = require("log4js");
        var path = this.instanceDir+'/ZLUX/pluginStorage/com.rs.bzadm/history';
        try{
            if(!fs.existsSync(path))
            {
                this.utiles.createDirs(path);
            }
        } catch (error) {
            this.log4import.getLogger().error('create dir error:'+ error.stack);
        }
        log4js.configure({
            replaceConsole: true,
            pm2: true,
            appenders: {
                stdout: {
                    type: 'console'
                },
                req: {  
                    type: 'dateFile',    
                    filename: path+"/import",  
                    pattern: 'log',
                    alwaysIncludePattern: true
                },
                err: {  
                    type: 'dateFile',
                    filename: path+"/error",
                    pattern: 'log',
                    alwaysIncludePattern: true
                },
                warn: {  
                    type: 'dateFile',
                    filename: path+"/warn",
                    pattern: 'log',
                    alwaysIncludePattern: true
                }
        
            },
            categories: {
                
                default: { appenders: ['stdout', 'req'], level: 'debug' },
                err: { appenders: ['stdout', 'err'], level: 'error' },
                warn: { appenders: ['stdout', 'warn'], level: 'warn' },
            }
        });
        return log4js;
     }
     getDetails(name,level) {   
        var path = this.instanceDir+'/ZLUX/pluginStorage/com.rs.bzadm/history';
        var logFile = '';
        if(level=='warn')
        logFile = path+"/warn.log";
        if(level=='error')
        logFile = path+"/error.log";

        let objs = new Array();
        const mappingValue = fs.readFileSync(logFile, "utf8");
            if (mappingValue) {
                
               var allLines = mappingValue.split("\n");
               for(let i=0; i< allLines.length; i++) 
               {
                    var text = allLines[i];
                    if(text.indexOf(name+":")>0)
                    {
                        let obj = {};
                        obj.name = text.substring(text.indexOf(name+":"),text.indexOf("|")).trim();
                        obj.message = text.substring(text.indexOf("|")+1).replace("\r","").trim();
                        if(obj.name !=undefined && obj.name.length>0)
                        objs.push(obj);
                    }
                    
               }
                
            }
        return objs;
     }     
     formatDateTime( dateObj ) {
        const iYear = dateObj.getFullYear();
        const iMonth = dateObj.getMonth() + 1;
        const sMonth = iMonth < 10? `0${iMonth}`: iMonth;
        const iDay = dateObj.getDate();
        const sDay = iDay < 10? `0${iDay}`: iDay;
        const iHour = dateObj.getHours();
        const sHour = iHour < 10? `0${iHour}`: iHour;
        const iMin = dateObj.getMinutes();
        const sMin = iMin < 10? `0${iMin}`: iMin;
        const iSec = dateObj.getSeconds();
        const sSec = iSec < 10? `0${iSec}`: iSec;
        
        return `${sMonth}/${sDay}/${iYear} ${sHour}:${sMin}:${sSec}`;
    }

    async determineSessionSettings(values,session,type,admin_attribs,admin_hotspots,createId) {
        let attributeMap = session.Display.AttributeMap;
        let hotspots = session.Display.HotSpots;
        if ((attributeMap!=undefined&&attributeMap.length>0) || (hotspots!=undefined&&hotspots.length>0)) {
            if (attributeMap) {
                attributeMap = attributeMap.toString().substring(0,attributeMap.toString().indexOf("."));
                if (admin_attribs[attributeMap] == undefined) {
                    if (createId){
                        this.log4import.getLogger('warn').warn("session:session"+" | Session '"+values.name+"': Attribute Map " + session.Display.AttributeMap + " is missing");
                        this.log4import.getLogger().warn("session:session"+" | Session '"+values.name+"': Attribute Map " + session.Display.AttributeMap + " is missing");
                    }
                    if ( type == "3270") attributeMap = "def3270";
                    else if ( type == "5250") attributeMap = "def5250";
                    else if ( type == "VT") attributeMap = "defvt";
                    if (createId) {
                        var destination = this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/temp/cfgDir/atm/" + attributeMap + ".atm";
                        if (!fs.existsSync(destination)) {
                            var dataFromFile = await this.readFilePromise(this.productDir + DEFAULT_PATH, attributeMap + ".atm");
                            fs.writeFileSync(destination,dataFromFile);
                        }
                    }
                }
            }
            if (hotspots) {
                hotspots = hotspots.toString().substring(0,hotspots.toString().indexOf("."));
                if (admin_hotspots[hotspots] == undefined) {
                    if (createId){
                        this.log4import.getLogger('warn').warn("session:session"+" | Session '"+values.name+"': HotSpot " + session.Display.HotSpots + " is missing");
                        this.log4import.getLogger().warn("session:session"+" | Session '"+values.name+"': HotSpot " + session.Display.HotSpots + " is missing");
                    }
                    if ( type == "3270") hotspots = "def3270";
                    else if ( type == "5250") hotspots = "def5250";
                    else if ( type == "VT") hotspots = "defvt";
                }
            }
            let filename = attributeMap;
            if ( (attributeMap && hotspots) && (attributeMap != hotspots)) {
                filename = attributeMap + "_" + hotspots;
            }
            var sessionSettingId = await this.utiles.getIdByName("sessionSetting", filename);
            values.sessionSettings = (sessionSettingId!=undefined)?sessionSettingId:"";
            if (createId) {
                let newId = await this.utiles.ensureMapping("sessionSetting",type,filename);
            }
        }
    }

    async doImportSession(params) {
        var wcUpgradeData = await this.upgradeDataService.getWCdata(params.dirkey);
        var sessions = JSON.parse(wcUpgradeData);
        if(sessions==undefined) {
            this.log4import.getLogger('warn').warn("session:session | ses folder not exists");
            this.log4import.getLogger().warn("session:session | ses folder not exists");
        }

        var wcUpgradeData2 = await this.upgradeDataService.getWCdata("admin_atm");
        var admin_attribs = JSON.parse(wcUpgradeData2);
        var wcUpgradeData3 = await this.upgradeDataService.getWCdata("admin_hsp");
        var admin_hotspots = JSON.parse(wcUpgradeData3);


        for(let key of Object.keys(sessions)) 
        {//loop all session
        try {
            let session = sessions[key];
            var values ={};
            values.name = await this.getSessionName(session,key);//;//session name
            values.label = await this.getSessionLabel(session,key); //session label
            values.windowTB = await this.getSessionTitle(session,key);

            var type = session.Configuration.Emulation;// session connection type
            if(session.Configuration!=undefined)
            {
                if(session.Configuration.Protocol=="TN")
                {
                    values.connectionType="Telnet";
                    values.securityType="0";
                }else{
                    values.connectionType = "Telnet";
                    if(session.Configuration.Protocol=="SSH"){
                        values.connectionType="SSH";
                        values.securityType="1";
                    } 
                }

                if(session.Configuration.SSLToHost=="ON")
                {
                    values.connectionType="TLS"; 
                    values.securityType="2";
                    if(type=="VT") 
                    {
                        values.securityType="0";
                        values.connectionType="Telnet"; //if VT TLS enabled ,Telnet instead
                    } 
                }
            }else{
                values.connectionType="Telnet";
                values.securityType="0";
            }
            
            values.groupName = '';
            
            var defaultHost = "WCMIDRANGE";
            var defaultPort = '23';
            if(type=="VT") 
            {
                defaultHost = "CUNIXHOS";
                defaultPort = '22';
            }
            values.host = (session.Network!=undefined &&session.Network.HostName!=undefined)?session.Network.HostName:defaultHost;
            values.port = (session.Network!=undefined &&session.Network.Port!=undefined)?session.Network.Port+'':defaultPort;
            if(type=="3270")
            {
                var alternateScreenSize = session['3270'].AlternateScreenSize;
                values.type = "3270Model"+alternateScreenSize;
                if(session.RUI!=undefined)
                {
                    this.log4import.getLogger('warn').warn("session:session | Session '"+values.name+"': session type RUI is not supported ");
                    this.log4import.getLogger().warn("session:session | Session '"+values.name+"': session type RUI is not supported ");
                    continue;
                } 
                if(session['3270']['3270Type']=="3279") values.type = "3270Model"+alternateScreenSize+"_3279";
            }else if(type=="5250")
            {
                var deviceType = session['5250']['5250Type'];
                if(deviceType=="3179")
                {
                    values.type = "5250Model3179-2";
                }else if(deviceType=="3477")
                {
                    values.type = "5250Model3477-FC";
                }else if(deviceType=="3196")
                {
                    values.type = "5250Model3196-A1";
                }else if(deviceType=="5251")
                {
                    values.type = "5250Model5251-11";
                }else{
                    values.type = "5250Model3179-2";
                }
                
            }else if(type=="VT")
            {
                values.type = "VT220";
                if(session.VT!=undefined)
                {
                    values.rows = session.VT.Lines;
                    values.columns = session.VT.Columns;
                    values.sessionMaxSize = false;
                }
                if(session.Pipe!=undefined)
                {
                    var cmd = session.Pipe.Cmd;
                    var cmdArray = cmd.split(" ");
                    for(var i=0;i<cmdArray.length;i++)
                    {
                        var word = cmdArray[i];
                        if(word.toLowerCase()=="-p")
                        {
                            if(/\d/.test(cmdArray[i+1]))
                            {
                                values.port = cmdArray[i+1];
                            }else{
                                values.port = '22'; 
                            }
                            
                        }
                        if(word.toUpperCase().indexOf("$USER")>=0)
                        {
                            if(/\w+/.test(word))
                            {
                                if(cmdArray[i+1]!=undefined)
                                {
                                    if(cmdArray[i+1].indexOf(":")>=0)
                                    {   
                                        values.host = cmdArray[i+1].substring(0,cmdArray[i+1].indexOf(":"));
                                        values.port = cmdArray[i+1].substring(cmdArray[i+1].indexOf(":")+1);
                                    }else{
                                        values.host = cmdArray[i+1];
                                    }
                                }
                               
                            }
                            
                        }
                        if(i==cmdArray.length-1 && values.host =="CUNIXHOS")
                        {
                            if(/\w+/.test(word))
                            values.host = word;
                        }
                        
                    }
                    if(values.port==undefined || values.port.length<=0)
                    values.port = '22'; 
                }
                
            }else if(type=="3287")
            {
                values.type = "3287Model2";
            }else if(type=="3812")
            {
                this.log4import.getLogger('warn').warn("session:session"+" | Session '"+values.name+"': session type 3812 is not supported ");
                this.log4import.getLogger().warn("session:session"+" | Session '"+values.name+"': session type 3812 is not supported ");
                continue;
            }
            var keepAlive = session.Network!=undefined?session.Network.KeepAlive:"";
            if(keepAlive=="ON")
            {
                values.keepAlive = {"timerOptions":"1","timerValue":"1"};
            }else{
                values.keepAlive = {"timerOptions":"0","timerValue":"1"};
            }
            
            if(session.TN != undefined)
            {//LU name
                values.luName = await this.getLUname(session);

                if(type=="5250")
                {
                    values.signon= {};
                    values.signon.sessionUsername = session.TN.AS400UserID;
                    values.signon.sessionPassword = Buffer.from(session.TN.AS400Password).toString('base64');;
                    values.signon.sessionProgram = session.TN.AS400Program;
                    values.signon.sessionInitialMenu = session.TN.AS400Menu;
                    values.signon.sessionCurrentLibrary = session.TN.AS400Library;
                    values.signon.key = null;
                    values.signon.isEdit = true;
                    values.signon.authentication = '';
                    await userSrc._encryptObject(values.signon || {}, 'sessionPassword');
                }
            }

            let rs = await bzdb.select('sessionShared', {id: key});
            if (rs.rowCount > 0){//to override
                var override = params.override;
               if(override=="true"||override==true)
               {
                this.needToUpdScope.push(key);// if override data, have to update or insert session's scope
                if(rs.rowCount>0)
                {
                    if(rs.data[0].name!=values.name)
                    {
                        // handle duplicated name
                        let rs1 = await bzdb.select('sessionShared', {name: values.name});
                        if(rs1!=undefined && rs1.rowCount>0){
                            for(var i=1;i<=99;i++)
                            {
                                var duplicatedName = rs1.data[0].name+" #"+i;   
                                let rs2 = await bzdb.select('sessionShared', {name: duplicatedName});
                                if(rs2!=undefined &&rs2.rowCount>0 && rs.data[0].id == rs2.data[0].id)
                                {
                                    values.name = duplicatedName;
                                    break;
                                }
                                
                            }
                        }
                        
                        
                    }

                    await this.determineSessionSettings(values,session,type,admin_attribs,admin_hotspots,true);
                    
                    values.id = rs.data[0].id;
                    rs=await bzdb.updateOrInsert('sessionShared', values);
                    if(rs.status) {
                        this.sesSucess.set(values.id,values);
                        this.log4import.getLogger().info(' update or insert '+'session id: '+values.id+'/session name: '+values.name+' successfully');
                    }
                    
                }                       
               }else
               {
                    // this.log4import.getLogger().warn("Session '"+values.name+"': already exists");
                    // this.log4import.getLogger('warn').warn("session:session"+" | Session '"+values.name+"': already exists");
                    continue;
               }
               
            }else{
                this.needToUpdScope.push(key);// if no-override data and session didn't exist, to insert scope
                values.id = key;//set webconnect id to RTE session's id
                let rs1 = await bzdb.select('sessionShared', {name: values.name});
                if(rs1!=undefined&& rs1.rowCount>0)
                {// handle duplicated name
                    for(var i=1;i<=99;i++)
                    {
                        var duplicatedName = values.name+" #"+i;
                        let rs2 = await bzdb.select('sessionShared', {name: duplicatedName});
                        if(rs2!=undefined && rs2.rowCount<=0)
                        {
                            values.name = duplicatedName;
                            break;
                        }
                    }
                }
                values.security = {};
                values.security.principle = "";
                values.security.tlsMin = "TLSv1";

                await this.determineSessionSettings(values,session,type,admin_attribs,admin_hotspots,true);

                rs = await bzdb.insert('sessionShared', values);
                if(rs.status)
                {
                    this.sesSucess.set(values.id,values);
                    this.log4import.getLogger().info(' insert session id: '+values.id+' / session name: '+values.name+' successfully');
                }
            }
            
            } catch (error) {
                this.log4import.getLogger().error("Session '"+key+"': |"+error.stack);
                this.log4import.getLogger('err').error("session:session"+" | Session '"+key+"': import failed");
            }
        }
         
        
    return true;
}
async doImportGroup(params) {
        var that = this;
        var allUserData = await this.upgradeDataService.getWCdata("user",true);
        var users = JSON.parse(allUserData);
        if(users==undefined) {
            this.log4import.getLogger('warn').warn("user:user | user folder not exists");
            this.log4import.getLogger().warn("user:user | user folder not exists");
        }
        var groups = new Map();
        var sessionData = await this.upgradeDataService.getWCdata("admin_ses");
        var sharedSessions = JSON.parse(sessionData);
        for(let item of Object.keys(users)) 
        {
            var domain ;
            var username;
            if(item.toString().toUpperCase().endsWith(".SSO")) continue; //not sure what .sso files mean yet, perhaps Single Sign-on?
            if(item.indexOf("@")>0)
            {
                    domain = item.substring(item.indexOf("@")+1).trim();
                    username = item;//item.substring(0,item.indexOf("@")).trim();
                    if(groups.get(domain)==undefined)
                    {
                        var groupUser = new Array();
                        groups.set(domain,groupUser);
                    }
       
            }
            let user = users[item];
            if (user.sessions === undefined){
                this.log4import.getLogger().error('add user '+item+' to group failed');
                continue;
             } 
            if(item.indexOf("@")>0)
                {
                    if(!groups.get(domain).includes(username))
                    groups.get(domain).push(username);
                }
             
        }
        let groupSessions = new Array();
        for(let entity of groups) {
            if(entity[0]!=undefined)
            {
                let options = {};
                options.groupName = entity[0];
                let rsGroupSearch = await bzdb.select('group', {groupName: options.groupName});
                if (rsGroupSearch.rowCount > 0){
                    if(rsGroupSearch.data[0]!=undefined) options.id = rsGroupSearch.data[0].id;
                } else {
                    options.id = bzdb.getUIDSync();
                }
                let groupTemplate = {
                            "groupName": "",
                            "shortName": "",
                            "leader": "",
                            "parentGroupName": "",
                            "description": "",
                            "internalUsers": [],
                            "sessions": [],
                            // if privilege is {}, cannot distinct if editLU is from 1.2.0
                            "privileges": { // TBD, this data exists in several different places. We should put it to one place only.
                                createSession: false,
                                cloneSession: false,
                                removeSession: false,
                                editLU: true,
                                sessionSettings: false,
                                enableRecorder: false,
                                enableUseEditor: false,
                                enablePlayScript: false,
                                enablePrivateScript: false,
                                enableSharedScript: false,
                                enableEditSession: false,
                                enableEditFontSize: true,
                                enableEditColors: true,
                                enableEditCursor: true,
                                enableShowLaunchPadMenu: false,
                                enableEditLaunchPad: true,
                                enableEditkeyboardMapping: true,
                                enableEditHotSpots: true,
                                enableEditLanguage: true
                            },
                            "timestamp": new Date().getTime(),
                            "ldapUsers": [],
                            "mssqlUsers": [],
                            "ssoUsers": []
                        };
            options = Object.assign(groupTemplate, options);
            options.type = "name";
            let dir = that.instanceDir + GROUP_PATH;
            let users = (entity[1]!=undefined) ? entity[1] :{};
            users.forEach(function(k){
                options.internalUsers.push({userId: k});
            });
            let rs = await bzdb.select('sessionShared');
            if(rs!=undefined && rs.rowCount > 0)
            {
                for(var i=0;i<rs.rowCount;i++)
                {
                    for(let sid of Object.keys(sharedSessions)) 
                    {//loop all session
                        if(rs.data[i].id==sid)
                        {
                            let agency = params.agency;
                            let matchedSes = [];
                            let matchedDefSes = this.defaultSes.filter(e => sid.indexOf(e)===0); // match the default session
                            if(agency && Object.keys(agency).length>0 ){
                                matchedSes = agency.filter(e => e.id.length>0 && sid.indexOf(e.id)>=0 && e.checked && e.key===options.groupName);
                                if (matchedSes.length <=0 && matchedDefSes.length <=0 ) continue;
                            }
                            if(agency && Object.keys(agency).length>0) {// if have agecny
                                if(matchedDefSes.length <=0){ //if not default webconnect session 
                                    options.sessions.push(sid); // don't assign the default session to group
                                }
                                if(matchedSes.length > 0) {// machted the selected agency to add to group session
                                    let obj = {};
                                    obj.id = sid;
                                    obj.gid = options.id;
                                    if(this.needToUpdScope && this.needToUpdScope.includes(sid)){//fixes for JSTE-16544, if session in the update session list, also update scope 
                                        groupSessions.push(obj);
                                    }
                                }
                            } else {// import all session
                                options.sessions.push(sid); 
                                await bzdb.delete('groupSession',{id: sid});// remove session from group session
                            }
                        }
                        
                    }
                }
                
            }
            try {
                if (rsGroupSearch.rowCount > 0){
                    var override = params.override;
                    if(override=="true"||override==true)
                    {
                        let rs1 =  await bzdb.updateOrInsert('group', options);
                        if(rs1!=undefined && rs1.status) {
                            this.groupSucessCount++;
                            this.log4import.getLogger().info('update group '+options.groupName+' successfully');
                        }
                    }
                }else{
                    let rs1 =  await bzdb.updateOrInsert('group', options);
                    if(rs1!=undefined && rs1.status) {
                        this.groupSucessCount++;
                        this.log4import.getLogger().info('insert group '+options.groupName+' successfully');
                    }
                } 
            } catch (error)
            {
                this.log4import.getLogger().error("insert group:"+options.groupName+"| "+error.stack);
                this.log4import.getLogger('err').error("group:"+options.groupName+"| "+error.stack);
            }
            
        
        }
        }
        if(groupSessions.length>0) {
            //groupid   sessionid 
            let resultGroupUserPrivilege = await bzdb.bulkLoad('groupSession', groupSessions);
            if(resultGroupUserPrivilege.status) {
                that.log4import.getLogger().info("update group_sessions successfully");
            }
         }
        return groups;
    }
    async doImportUser(params) {
        var dirkey = params.dirkey;
        var wcData = await this.upgradeDataService.getWCdata(dirkey, true);
        var that = this;
        var users = JSON.parse(wcData);
        if(users==undefined) {
            this.log4import.getLogger('warn').warn("user:user | user folder not exists");
            this.log4import.getLogger().warn("user:user | user folder not exists");
        }
        var groups = new Map();
        var sessionData = await this.upgradeDataService.getWCdata("admin_ses");
        var sharedSessions = JSON.parse(sessionData);
        let userSession = new Map();
        let userInfoArray = new Array();
        let userLoginArray = new Array();
        for(let key of Object.keys(users)) 
        {//loop all user
        try{
            let user = users[key];
            var options ={};
            options.userId = key;
            options.userName = key;
            options.timestamp = new Date().getTime();
            if(key.toString().toUpperCase().endsWith(".SSO")) {
                //not sure what .sso files mean yet, perhaps Single Sign-on?
                this.log4import.getLogger().error('insert user '+key+' failed');
                this.log4import.getLogger('err').error('user:| import '+key+' failed');
                continue;
            } 
            var domain ='';
            var username = key;
            if(key.indexOf("@")>0)
            {
                domain = key.substring(key.indexOf("@")+1).trim();
                username = key;
            }
            
            const rs = await bzdb.select('userInfo', {userId: options.userId});
            for(var j=1;j<=32;j++)
            {
                if(rs.rowCount>0)
                {
                    if(rs.data[0]["LU"+j]!=undefined)
                    {
                        var lu = rs.data[0]["LU"+j];
                        if(lu==undefined||lu.length<=0)
                        {
                            options["LU"+j] = lu;
                        }
                    }  
                }else{
                     options["LU"+j] = ""; 
                }
               
            }
            if (user.sessions === undefined){
                this.log4import.getLogger().error('insert user '+key+' failed');
                this.log4import.getLogger('err').error('user:| import '+key+' failed');
                continue;
            } 
            for(let i of Object.keys(user.sessions)) 
            {// import user's session to self-defined
                if(i.toString().toUpperCase().startsWith("NEXT")) continue;
                var sessionInfo = user.sessions[i];
                var arr=sessionInfo.toString().split("~"); 
                if(arr!=undefined&&arr.length>=5)
                {
                    var type=arr[1];
                    var ipport=arr[2];
                    var luname=arr[3];
                    var lblname=arr[4];
                    let session={};
                    session.userId = key;
                    
                    var sessionName = arr[0];
                    var sessionId = sessionName.substring(0,sessionName.toString().indexOf("."));
                    var sharedSession = sharedSessions[sessionId];
                    if(groups.get(key)==undefined)
                    {
                        var sessions = new Array();
                        groups.set(key,sessions);
                    }
                    if(ipport!=undefined && ipport.length>0)
                    {
                        session.TCPHost = ipport.toString().split(":")[0];
                        session.TCPPort = (ipport.toString().split(":")[1]!=undefined) ? ipport.toString().split(":")[1]:sharedSession.Network.Port;
                        if(sharedSession!=undefined && sharedSession.Network!=undefined
                            && sharedSession.Network.HostName == session.TCPHost 
                            && sharedSession.Network.Port==session.TCPPort)
                        {
                            if(!groups.get(key).includes(sessionId))
                            {
                                groups.get(key).push(sessionId);
                            }
                            if(luname!=undefined && luname.length>0)
                            {
                                let pSession = await bzdb.select('sessionShared', {id: sessionId});
                                if(pSession!=undefined && pSession.rowCount>0){
                                    let values = pSession.data[0];
                                    values.luName =  luname ;
                                    let obj = {};
                                    obj.userId = options.userId;
                                    obj.values = values;
                                    if(userSession.get(sessionId)) {
                                        userSession.get(sessionId).push(obj);
                                    }else {
                                        var nwArray = new Array();
                                        nwArray.push(obj);
                                        userSession.set(sessionId,nwArray);
                                    }
                                }
                            }
                        }else
                        {
                            var groupId = '';
                            if(domain != undefined  && domain.length > 0){
                                let searchRs = await bzdb.select('group', {groupName: domain});
                                var group ={};
                                if(searchRs!=undefined && searchRs.rowCount>0)
                                {
                                    group = searchRs.data[0];
                                    groupId = group.id;
                                }
                            }
                            var privateId = ipport+"-"+sessionId+"-"+groupId;
                            let rs2 = await bzdb.select('sessionShared', {id: sessionId});
                            if(rs2!=undefined && rs2.rowCount>0)
                            {// copy session's detail ,only update session's name,host,port
                                let values = rs2.data[0];
                                values.name = ipport+"-"+sessionId;
                                values.host = session.TCPHost;
                                values.port = session.TCPPort;
                                values.id = privateId;//ipport+"-"+sessionId;
                                values.label = lblname || '';
                                values.windowTB = '';
                                if(luname!=undefined && luname.length>0)
                                {
                                    values.luName =  luname ;
                                }
                                let obj = {};
                                obj.userId = options.userId;
                                obj.values = values;
                                if(userSession.get(privateId)) {
                                    userSession.get(privateId).push(obj);
                                }else {
                                    var nwArray = new Array();
                                    nwArray.push(obj);
                                    userSession.set(privateId,nwArray);
                                }
                            }
                            if(domain!=undefined && domain.length > 0)
                            {
                                let rs3 = await bzdb.select('group', {groupName: domain});
                                if(rs3!=undefined && rs3.rowCount>0)
                                {
                                    var group = rs3.data[0];
                                    const batchTxnData = [];
                                    batchTxnData.push(
                                        {dataEntityName: 'groupSession', options: {}, action: 'UPDATEORINSERT', value: {id: privateId, gid: group.id}}
                                    );
                                    let sessionForUser = [];
                                    if(params.override=="true"||params.override==true)
                                    {
                                        await bzdb.delete('groupUserPrivilege',{groupId: groupId, userId: key, sessionId: privateId});
                                        sessionForUser.push({userId: key, groupId: group.id, sessionId: privateId});
                                    } else {
                                        const userSessionByName = await bzdb.select('groupUserPrivilege', {groupId: groupId,userId: key, sessionId: privateId});
                                        //if didn't override,to add relationship
                                        if(userSessionByName && userSessionByName.rowCount<=0){
                                            sessionForUser.push({userId: key, groupId: group.id, sessionId: privateId});
                                        }
                                    }
                                    sessionForUser.forEach(element => {
                                        batchTxnData.push({dataEntityName: 'groupUserPrivilege', action: 'UPDATEORINSERT', value: element});
                                    });
                                    const result = await bzdb.batchTxn(batchTxnData);
                                    if (result.status) {
                                        this.log4import.getLogger().info(' add private session:'+privateId+' to '+domain+' successfully');
                                    }
                                }
                            }
                             //add private session to 
                            if(!groups.get(key).includes(privateId))
                            {
                                groups.get(key).push(privateId);
                            }
                        }        
                    }else{
                            //fixes for JSTE-14743, rs73_printer.ses not exist in public session list,it shouldn't be assigned to user
                            if(sharedSession!==undefined && !groups.get(key).includes(sessionId))
                            {
                                groups.get(key).push(sessionId);
                            }
                       
                            if(luname!=undefined && luname.length>0)
                            {
                                if(ipport==undefined || ipport.length==0)
                                {
                                    options['LU1'] = luname;
                                }
                               
                            }
                    }
                    
                }
            }
                
                if (rs.rowCount > 0){
                    var override = params.override;
                   if(override=="true"||override==true)
                   {//to override or not if exists
                     options.password = options.password ? options.password : 'password';
                     userInfoArray.push(options);
                     const userLoginValue = await that.userDataService.getUserLoginValue(options);
                     userLoginArray.push(userLoginValue);
                     this.log4import.getLogger().info("update user "+options.userName+" successfully");
                     this.userSucessCount++;
                   }else
                   {
                       continue;
                   }
                  
                }else{
                    options.password = options.password ? options.password : 'password';
                    userInfoArray.push(options);
                    const userLoginValue = await that.userDataService.getUserLoginValue(options);
                    userLoginArray.push(userLoginValue);
                    this.log4import.getLogger().info("insert user "+options.userName+" successfully");
                    this.userSucessCount++;
                }
                if(Object.keys(user.sessions).length <= 1) {//if no private session, if do override, it should be current group session 
                    if(params.override=="true"||params.override==true)
                    await bzdb.delete('groupUserPrivilege',{userId: options.userName});
                }
            }catch(error){
                this.log4import.getLogger().error('user:'+key+'|'+error.stack);
                this.log4import.getLogger('err').error('user:| import '+key+' failed');
            }  
                    
        }
        var k = 1;
        var sesSequence = new Map();
        for(let key of Object.keys(sharedSessions)) 
        {
            try {
                let ses = sharedSessions[key];
                if(ses.Configuration!=undefined){
                    var type = ses.Configuration.Emulation;
                    if(type == "VT" || type == "3812" || ses.RUI!=undefined)  continue;
                }
                var luName = await this.getLUname(ses);
                sesSequence.set(key,k +"_"+luName);
                if(k==32) break;
                k++; 
            } catch (error) {
                this.log4import.getLogger().error("loop sessions error:"+error.stack);
            }
        }
        // update user's LU name and update session's LU to %s9%
        userSession.forEach(async (entity,id)=>{
            let sess = userSession.get(id);
            if(Object.keys(sess).length>0) {
                let pSession = sess[0].values;
                if(Object.keys(sess).length === 1) {
                    pSession.luName = pSession.luName;
                } else if(Object.keys(sess).length > 1) {
                    let index = 0;
                    if(sesSequence.get(id)){
                        index = sesSequence.get(id).split("_")[0];
                    } else {
                        index = sesSequence.size + 1;
                    }
                    sess.forEach(element => {
                        let matched = userInfoArray.filter(e=> e.userId== element.userId );
                        if(matched && matched.length>0) {
                            let values = matched[0];
                            if(values['LU'+index] == undefined || values['LU'+index] == '') {
                                let userLU = element.values && element.values.luName ?element.values.luName :'';
                                values['LU'+index] = userLU;
                                if(params.override=="true" || params.override==true)
                                {
                                    userInfoArray.push(values);
                                    sesSequence.set(pSession.id,index +"_"+ userLU);
                                }
                            }
                        }
                    });
                    pSession.luName = '%s'+ index +'%';
                }
                let ifExist = await bzdb.select('sessionShared', {id: id});
                if(ifExist!=undefined && ifExist.rowCount>0){
                    if(params.override=="true" || params.override==true) {
                        let newSesRs=await bzdb.updateOrInsert('sessionShared', pSession);
                        if(newSesRs.status) {
                            this.sesSucess.set(pSession.id,pSession);
                            this.log4import.getLogger().info(' update private session id:'+pSession.id+'/session name:'+pSession.name+' successfully');
                        }    
                    }
                } else {
                    let newSesRs=await bzdb.updateOrInsert('sessionShared', pSession);
                    if(newSesRs.status) {
                        this.sesSucess.set(pSession.id,pSession);
                        this.log4import.getLogger().info(' insert private session id:'+pSession.id+'/session name:'+pSession.name+' successfully');
                    }    
                }
            }
        });
        
        if(userInfoArray!=undefined && userInfoArray.length>0)
        {
            let resultUserInfo = await bzdb.bulkLoad('userInfo', userInfoArray);
            if(resultUserInfo.status) {
                that.log4import.getLogger().info("update or insert to userinfo  successfully");
            }
        }
        
        if(userLoginArray!=undefined && userLoginArray.length>0)
        {
            let resultUserLogin = await bzdb.bulkLoad('userLogin', userLoginArray);
            if(resultUserLogin.status) {
                that.log4import.getLogger().info("update or insert to userLogin  successfully");
            }
        }
        
        let groupUserSessions = new Array();

        for(let entity of groups) {
            if(entity[0]!=undefined)
            {
                if (entity[0].indexOf("@")<0) continue;
                let domain = entity[0].substring(entity[0].indexOf("@")+1);

                let userName = entity[0];
                let groupId = '';
                const rs = await bzdb.select('group', {groupName: domain});
                if(rs!=undefined && rs.data[0]!=undefined)
                    groupId = rs.data[0].id; 
                    
                let sessions = groups.get(userName);
                for (let i of Object.keys(sessions)) 
                {
                    var sessionId = sessions[i];
                    let obj = {};
                    obj.sessionId = sessionId;
                    obj.userId = userName;
                    obj.groupId = groupId;
                    if(params.override=="true"||params.override==true)
                    {
                        await bzdb.delete('groupUserPrivilege',{groupId: groupId, userId: userName});
                        groupUserSessions.push(obj);
                    } else {
                        const userSessionByName = await bzdb.select('groupUserPrivilege', {groupId: groupId,userId: userName});
                        //if didn't override,to add relationship
                        if(userSessionByName && userSessionByName.rowCount<=0){
                            groupUserSessions.push(obj);
                        }
                    }
                }
                
            }
            
        }
        //groupid  userid  sessionid 
        let resultGroupUserPrivilege = await bzdb.bulkLoad('groupUserPrivilege', groupUserSessions);
        if(resultGroupUserPrivilege.status) {
            that.log4import.getLogger().info("update group_user_sessions successfully");
        }

    }
    async doImportKeymap(params) {
            var dirkey = params.dirkey;
            var keepfilext = params.keepfilext;
            var wcData = await this.upgradeDataService.getWCdata(dirkey,keepfilext);
            if(wcData==undefined) {
                this.log4import.getLogger('warn').warn("keymap:keymap | keymap folder not exists");
                this.log4import.getLogger().warn("keymap:keymap | keymap folder not exists");
            }
            var that = this;
            let maps = JSON.parse(wcData);
            const dir = that.instanceDir + KEYBOARD_PATH;
            that.createDir(that.instanceDir + BASE_PATH);
            that.createDir(dir);
            var isShared = true;
            if(dirkey.toString().toLowerCase().indexOf("admin")==-1)//private keyboardmapping
                isShared = false;
            var table = 'keyboardMappingShared';
            if(!isShared) table = 'keyboardMappingPrivate';
            if(!isShared) {
               var result =await this.setKeyboardPrivate(table,maps,params);//maps is user's keymap ,mergedMap is session+server
            }else{
                maps.global3 = {};maps.global3.Keymap = {};maps.global3.Keymap.Emtype="3270";maps.global3.Keymap.Description="WC_G_3";
                maps.global5 = {};maps.global5.Keymap = {};maps.global5.Keymap.Emtype="5250";maps.global5.Keymap.Description="WC_G_5";
                maps.globalVT = {};maps.globalVT.Keymap = {};maps.globalVT.Keymap.Emtype="VT";maps.globalVT.Keymap.Description="WC_G_VT";
                let allGlobalKeymapArray = new Array();
                for(let key of Object.keys(maps)) 
                {
                    try{
                    const keys = maps[key];
                    let keyboard = {};
                    keyboard.name = await that.getKeymapName(keys);
                    if(key=="server3") 
                    {
                        keyboard.name = "WC_Server_3";
                        keys.Keymap.Emtype = "3270";
                    }
                    if(key=="server5"){
                        keyboard.name = "WC_Server_5";
                        keys.Keymap.Emtype = "5250";
                    } 
                    if(key=="serverVT") {
                        keyboard.name = "WC_Server_VT";
                        keys.Keymap.Emtype = "VT";
                    }
                    if(keys.Keymap.Emtype=="3270" && key!="server3" && key!="global3")
                    {
                        if(maps.server3!=undefined)
                        {
                            maps.server3.Keymap.Emtype = "3270";
                            let result = Object.assign(keys.Keymap,maps.server3.Keymap, keys.Keymap);
                        }
                        
                    }
                    if(keys.Keymap.Emtype=="5250" && key!="server5" && key!="global5")
                    {
                        if(maps.server5!=undefined)
                        {
                            maps.server5.Keymap.Emtype = "5250";
                            let result = Object.assign(keys.Keymap,maps.server5.Keymap, keys.Keymap);
                        }
                        
                    }
                    if(keys.Keymap.Emtype=="VT" && key!="serverVT" && key!="globalVT")
                    {
                        if(maps.serverVT!=undefined)
                        {
                            maps.serverVT.Keymap.Emtype = "VT";
                            let result = Object.assign(keys.Keymap,maps.serverVT.Keymap,keys.Keymap);
                        }
                        
                    }
                
                    keyboard.category = "keyboard";
                    keyboard.terminalType = keys.Keymap.Emtype;
                    keyboard.timestamp = Date.now();
                    keyboard.title = await that.getKeymapName(keys);
                    keyboard.type = keys.Keymap.Emtype;
                    
                    const rs = await bzdb.select(table, {name: keyboard.name});
                    if (rs.rowCount > 0){
                        if(rs.data[0]!=undefined)
                        keyboard.id = rs.data[0].id;
                        var override = params.override;
                        if(override=="true"||override==true)
                        {
                            this.log4import.getLogger().warn("The keymap name "+keyboard.name+" already exists");
                            let  result =await that.saveKeyboardMapping(table,keyboard,keys);
                            await bzdb.updateOrInsert(table, result);
                            if(isShared) this.keymapSucessCount++;
                        }else {
                            this.log4import.getLogger().warn("The keymap "+keyboard.name+" didn't be override");
                        }
                    }else{
                        let id = await that.asyncGetKeyboardId(keyboard);
                        keyboard.id = id;
                        let  result =await that.saveKeyboardMapping(table,keyboard,keys);
                        allGlobalKeymapArray.push(result);
                        if(isShared) this.keymapSucessCount++;
                    }
                    
                }catch(ex){
                    this.log4import.getLogger('err').error('"keymap:|'+ex.stack);
                    continue;
                }
                   
            }
            if(allGlobalKeymapArray!=undefined && allGlobalKeymapArray.length>0)
            {
                let resultGlobalKeymap = await bzdb.bulkLoad(table, allGlobalKeymapArray);
                if(resultGlobalKeymap.status) {
                    that.log4import.getLogger().info("update or insert to "+table+"  successfully");
                }
            }
            return true;    
        }
    }
    async getSummary(params,result) {
        let data ={};
        var that = this;
        data.summary = new Array();
        data.details = {}
        try {
            // var sessionData = await this.upgradeDataService.getWCdata("admin_ses");
            // var sessions = JSON.parse(sessionData);
            var sessSucceed = new Array();
            var sessFailed = new Array();
            var sessWarning = new Array();
            /*
            let rs = await bzdb.select('sessionShared');
            if(rs!=undefined && rs.rowCount > 0)
            {
                for(var i=0;i<rs.rowCount;i++)
                {
                    for(let sid of Object.keys(sessions)) 
                    {//loop all session
                        
                        if(rs.data[i].id.indexOf(sid)>=0)
                        {
                            sessSucceed.push(rs.data[i].id);
                        }
                        
                    }
                }
                
            }
            */
            data.details.session = new Array();   
            sessFailed = this.getDetails('session','error');
            for(let i of Object.keys(sessFailed)) 
            {
                data.details.session.push({'type':'failed','info':sessFailed[i].message});
            }
            
            sessWarning = this.getDetails('session','warn');
            for(let i of Object.keys(sessWarning)) 
            {
                data.details.session.push({'type':'warning','info':sessWarning[i].message});
            }
            data.summary.push({name:'session',success:this.sesSucess.size,warning:Object.keys(sessWarning).length,failed:Object.keys(sessFailed).length});
        } catch (error) {
            data.summary.push({name:'session',success:0,warning:0,failed:0});
            data.details.session = new Array(); 
            that.log4import.getLogger().error("session error:"+error.stack);
        }
        try {
            /*
            var groupCount = 0;
            if(result!=undefined && result.groupCount!=undefined)
                groupCount = result.groupCount;
            */
            var groupFailed = new Array();
            var groupWarning = new Array();
            
            data.details.group = new Array();   
            groupFailed = this.getDetails('group','error');
            groupWarning = this.getDetails('group','warn');
            for(let i of Object.keys(groupFailed)) 
            {
                data.details.group.push({'type':'failed','info':groupFailed[i].message});
            }
            for(let i of Object.keys(groupWarning)) 
            {
                data.details.group.push({'type':'warning','info':groupWarning[i].message});
            }
            data.summary.push({name:'group',success:this.groupSucessCount,warning:Object.keys(groupWarning).length,failed:Object.keys(groupFailed).length});
            
        } catch (error) {
            data.summary.push({name:'group',success:0,warning:0,failed:0});
            data.details.group = new Array();   
            that.log4import.getLogger().error("group error:"+error.stack);
        }
        try {
            /*
            var userData  = await this.upgradeDataService.getWCdata("user",true);
            var users = JSON.parse(userData);
            */
            var userSucceed = new Array();
            var userFailed = new Array();
            var userWarning = new Array();
            /*
            for(let key of Object.keys(users)) 
            {//loop all user
                const rs = await bzdb.select('userInfo', {userId: key});
                if(rs.rowCount > 0)
                {
                    userSucceed.push(key);
                }

            }
            */
            
            userFailed = this.getDetails('user','error');
            userWarning = this.getDetails('user','warn');
            data.details.user = new Array();   
            for(let i of Object.keys(userFailed)) 
            {
                data.details.user.push({'type':'failed','info':userFailed[i].message});
            }
            for(let i of Object.keys(userWarning)) 
            {
                data.details.user.push({'type':'warning','info':userWarning[i].message});
            }
            data.summary.push({name:'user',success:this.userSucessCount,warning:Object.keys(userWarning).length,failed:Object.keys(userFailed).length});
            
        } catch (error) {
            data.summary.push({name:'user',success:0,warning:0,failed:0});
            data.details.user = new Array();   
            that.log4import.getLogger().error("user error:"+error.stack); 
        }
        try {
            /*
            var keymapData  = await this.upgradeDataService.getWCdata("admin_keymap");
            var keymaps = JSON.parse(keymapData);
            */
            var keymapSucceed = new Array();
            var keymapFailed = new Array();
            var keympaWarning = new Array();
            /*
            for(let key of Object.keys(keymaps)) 
            {
                var kname = await that.getKeymapName(keymaps[key]);
                const rs = await bzdb.select('keyboardMappingShared', {name: kname});
                if(rs.rowCount > 0)
                {
                    keymapSucceed.push(key);
                }
            }
            
            let definedKeymap = ['WC_Server_3','WC_G_3','WC_Server_5','WC_G_5','WC_Server_VT','WC_G_VT'];
            for(let i of Object.keys(definedKeymap))
            {
                let keymapName = definedKeymap[i];
                if(keymapName!=undefined)
                {
                    const rs = await bzdb.select('keyboardMappingShared', {name: keymapName});
                    if(rs.rowCount > 0)
                    {
                        keymapSucceed.push(keymapName);
                    }
                }
            }
            */
            keymapFailed = this.getDetails('keymap','error');
            keympaWarning = this.getDetails('keymap','warn');
            data.details.keymap = new Array();  
            for(let i of Object.keys(keymapFailed)) 
            {
                data.details.keymap.push({'type':'failed','info':keymapFailed[i].message});
            }
            for(let i of Object.keys(keympaWarning)) 
            {
                data.details.keymap.push({'type':'warning','info':keympaWarning[i].message});
            }
            data.summary.push({name:'keymap',success:this.keymapSucessCount,warning:Object.keys(keympaWarning).length,failed:Object.keys(keymapFailed).length});
            
        } catch (error) {
            data.summary.push({name:'keymap',success:0,warning:0,failed:0});
            data.details.keymap = new Array();  
            that.log4import.getLogger().error("keymap error:"+error.stack); 
        }
        try {
            /*
            var attData  = await this.upgradeDataService.getWCdata("admin_atm");
            var atts = JSON.parse(attData);
            */
            var attSucceed = new Array();
            var attFailed = new Array();
            var attWarning = new Array();
            /*
            for (var key in atts) {
                let rs1 = await bzdb.select('sessionSettingMapping');
                for(var i=0;i<rs1.data.length;i++) //look for all possible matches of this file in the global session settings
                {
                    let sname=rs1.data[i].name.split("_");
                    let name = sname[0];
                    if (name.indexOf(key)>=0) {
                        attSucceed.push(key); //only need to report each file once, no matter how many times it was used
                        break;
                    }
                }
            }
            */
            attFailed = this.getDetails('atm','error');
            attWarning = this.getDetails('atm','warn');
            data.details.atm = new Array();  
            for(let i of Object.keys(attFailed)) 
            {
                data.details.atm.push({'type':'failed','info':attFailed[i].message});
            }
            for(let i of Object.keys(attWarning)) 
            {
                data.details.atm.push({'type':'warning','info':attWarning[i].message});
            }
            data.summary.push({name:'attribute',success:this.attrSucessCount,warning:Object.keys(attWarning).length,failed:Object.keys(attFailed).length});
        
        } catch (error) {
            data.summary.push({name:'attribute',success:0,warning:0,failed:0});
            data.details.atm = new Array(); 
            that.log4import.getLogger().error("attibute error:"+error.stack); 
        }
        try {
            /*
            var hotspotData  = await this.upgradeDataService.getWCdata("admin_hsp");
            var hotspots = JSON.parse(hotspotData);
            */
            var hotspotSucceed = new Array();
            var hotspotFailed = new Array();
            var hotspotWarning = new Array();
            /*
            for (let key in hotspots) {

                let rs1 = await bzdb.select('sessionSettingMapping');
                for(var i=0;i<rs1.data.length;i++) //look for all possible matches of this file in the global session settings
                {
                    let sname=rs1.data[i].name.split("_");
                    let name = sname[1] || sname[0];
                    if (name.indexOf(key)>=0) {
                        hotspotSucceed.push(key); //only need to report each file once, no matter how many times it was used
                        break;
                    }
                }
            }
            */
            hotspotFailed = this.getDetails('hotspot','error');
            hotspotWarning = this.getDetails('hotspot','warn');
            data.details.hotspot = new Array();  
            for(let i of Object.keys(hotspotFailed)) 
            {
                data.details.hotspot.push({'type':'failed','info':hotspotFailed[i].message});
            }
            for(let i of Object.keys(hotspotWarning)) 
            {
                data.details.hotspot.push({'type':'warning','info':hotspotWarning[i].message});
            }
            data.summary.push({name:'hotspot',success:this.hspSucessCount,warning:Object.keys(hotspotWarning).length,failed:Object.keys(hotspotFailed).length});
            
        } catch (error) {
            data.summary.push({name:'hotspot',success:0,warning:0,failed:0});
            data.details.hotspot = new Array(); 
            that.log4import.getLogger().error("hotspot error:"+error.stack); 
        }
        try {
            //There is no admin_clk folder
            //var clkpdData  = await this.upgradeDataService.getWCdata("admin_clk");
            //var clkpds = JSON.parse(clkpdData);
            var clkpdSucceed = new Array();
            var clkpdFailed = new Array();
            var clkpdWarning = new Array();
            /*
            for (let key in clkpds) {

                let newId = this.utiles.getIdByName("sessionSetting", key)
                if(newId.length > 0)
                {
                    clkpdSucceed.push(newId);
                }
                
            }
            */
            clkpdFailed = this.getDetails('clickpad','error');
            clkpdWarning = this.getDetails('clickpad','warn');
            data.details.clickpad = new Array();  
            for(let i of Object.keys(clkpdFailed)) 
            {
                data.details.clickpad.push({'type':'failed','info':clkpdFailed[i].message});
            }
            for(let i of Object.keys(clkpdWarning)) 
            {
                data.details.clickpad.push({'type':'warning','info':clkpdWarning[i].message});
            }
            data.summary.push({name:'clickpad',success:Object.keys(clkpdSucceed).length,warning:Object.keys(clkpdWarning).length,failed:Object.keys(clkpdFailed).length});
            
        } catch (error) {
            data.summary.push({name:'clickpad',success:0,warning:0,failed:0});
            data.details.clickpad = new Array(); 
            that.log4import.getLogger().error("clickpad error:"+error.stack); 
        }
        var filename = "history.txt";
        var path = this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/history/"+filename;
        var timestamp = this.formatDateTime(new Date());
        var fname = "Import from LDAP";
        if(params.method=="file"){
            fname = params.filename;
        }else{
            fname = "Import from LDAP";
        }
        var writeData = fname+"|"+timestamp+"|";
        timestamp = timestamp.replace(/\//g,'_').replace(/:/g,'_').replace(' ','_');
        var destination = this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/history/"+"import_"+timestamp+".log";
        writeData = writeData +"import_"+ timestamp+".log";
        if(!fs.existsSync(path)) 
        {
            fs.writeFileSync(path,writeData);
        }else
        {
            writeData = "\r\n"+writeData;
            fs.appendFileSync(path,writeData);
        }
        
        var sourceFile =  this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/history/"+"import.log";
        
        fs.copyFile(sourceFile,destination,function(err){
            if(err) 
            {
                that.log4import.getLogger().error("something wrong was happened"+err.stack);
            }
            
            
        });
        
        return data;
    }

    async doImportAttribute(params) {
        const context = this.context;
        var dirkey = params.dirkey;
        var wcUpgradeData = await this.upgradeDataService.getWCdata(dirkey, true);
        var wcUpgradeData2 = await this.upgradeDataService.getWCdata("admin_clm");
        var wcUpgradeData3 = await this.upgradeDataService.getWCdata("clm", true);
        let import_result = true;
        var attribs = JSON.parse(wcUpgradeData);
        var colorsAdmin = JSON.parse(wcUpgradeData2);
        var colorsUser = JSON.parse(wcUpgradeData3);
        if(attribs==undefined) this.log4import.getLogger('warn').warn("atm:atm | atm folder not exists");
        if(colorsAdmin==undefined) this.log4import.getLogger('warn').warn("clm:clm | clm folder not exists");

        var isShared = true;
        if(dirkey.toString().toLowerCase().indexOf("admin")==-1)//private
            isShared = false;
        var table = 'preferenceShared';
        if(!isShared) table = 'preferencePrivate';
        if(!isShared) {
            var result = await this.setAttrColorsPrivate(table,attribs,colorsAdmin,colorsUser,params);
            if(result)
            {
                return true;
            }
            else
            {
                this.log4import.getLogger().error('Atrribute/Color import failed.');
                return false;
            }
        }
        else {
            for (var key in attribs) {
                let attrib = attribs[key];
                let filename = key.substring(0,key.indexOf("."));
                if (filename.length==0)
                    filename = key.substring(0,key.length);
                let bType;
                let colorKey;

                bType = attrib.Configuration.Emulation;
                bType = bType.replace("HC", ""); //Remove HC if part of string

                colorKey = filename + ".clm";
                //console.log(colorKey);
                //console.log(bType);
                let color = {};
                if ( colorsUser[colorKey] ) {
                    color = colorsUser[colorKey];
                }
                else {
                    if ( colorsAdmin[colorKey] ) {
                        color = colorsAdmin[colorKey];
                    }
                    else {
                        if ( bType == "3270")
                            colorKey = "def3270";
                        else if ( bType == "5250")
                            colorKey = "def5250";
                        else if ( bType == "VT")
                            colorKey = "defvt";
                        if ( colorsAdmin[colorKey] ) {
                            color = colorsAdmin[colorKey];
                        }
                        else
                        {
                            this.log4import.getLogger().error('Atrribute/Color Missing default color file: ' + colorKey);
                            return false;
                        }
                    }
                }

                let matched = false; //no matches so far
                let rs1 = await bzdb.select('sessionSettingMapping');
                for(var i=0;i<rs1.data.length;i++) //look for all possible matches of this file in the global session settings
                {
                    let prefs = {};
                    let hotspot = {};
                    let launchpad = {};
                    let newId = "";
                    let sname=rs1.data[i].name.split("_");
                    let name = sname[0]; //index 0 for Attribute matches, index 1 for HotSpots
                    if (name.indexOf(filename)>=0) {
                        matched = true;
                        newId = rs1.data[i].id;
                        //need to get existing settings and then overwrite just color values
                        try {
                            prefs = this.utiles.ReadPreferenceFile(bType, newId);
                            hotspot = this.utiles.ReadHotSpotFile(bType, newId);
                            launchpad = this.utiles.ReadLaunchPadFile(bType, newId);
                        }
                        catch {
                            prefs = await this.sessionSettingsService.getDefaultPreference(bType);
                            hotspot = await this.sessionSettingsService.getDefaultHotspots(bType);
                            launchpad = await this.sessionSettingsService.getDefaultLaunchpad(bType);
                        }

                        this.convertAttrColors(prefs,attrib,color,bType);

                        const dataObj = {timestamp: Date.now(), id: newId };
                        const prefsValue = Object.assign({}, prefs, dataObj);
                        var override = params.override;
                        if(override=="true"||override==true) {
                            try {
                                let rs = await bzdb.updateOrInsert('preferenceShared', prefsValue);
                                if(rs!=undefined && rs.status) {
                                    this.attrSucessCount++;
                                    this.log4import.getLogger().info("update or insert attribute id:"+filename+"/atrribute name:"+attrib.Description.Description+ "(" + newId +") successfully");
                                }          
                                const hotspotValue = Object.assign({}, hotspot, dataObj);
                                await bzdb.updateOrInsert('hotspotShared', hotspotValue);
                                const launchpadValue = Object.assign({}, launchpad, dataObj);
                                await bzdb.updateOrInsert('launchpadShared', launchpadValue);
                            } catch (error) {
                                this.log4import.getLogger().error(error);
                                import_result = false;
                            }
                        }
                    }
                }

                if (!matched) {
                    let bNew;
                    let prefs = {};
                    let launchpad = {};
                    let hotspot = {};
                    let utiles=new Utiles(context);
                    let newId = await utiles.getIdByName("sessionSetting", filename)
                    if ( newId === "" ) {
                        newId = await utiles.ensureMapping("sessionSetting",bType,filename);
                        prefs = await this.sessionSettingsService.getDefaultPreference(bType); //bring in default preferences because just colors cause the UI to misbehave
                        launchpad = await this.sessionSettingsService.getDefaultLaunchpad(bType);
                        hotspot = await this.sessionSettingsService.getDefaultHotspots(bType);
                        bNew = true;
                    }
                    else
                    {
                        //need to get existing settings and then overwrite just color values
                        prefs = this.utiles.ReadPreferenceFile(bType, newId);
                        bNew = false;
                    }

                    this.convertAttrColors(prefs,attrib,color,bType);

                    const dataObj = {timestamp: Date.now(), id: newId };
                    const prefsValue = Object.assign({}, prefs, dataObj);
                    try {
                        let rs = await bzdb.updateOrInsert('preferenceShared', prefsValue);
                        if(rs!=undefined && rs.status)
                        this.log4import.getLogger().info("update or insert attribute id:"+filename+"/atrribute name:"+attrib.Description.Description+ "(" + newId +") successfully");
                        if (bNew) {
                            const launchpadValue = Object.assign({}, launchpad, dataObj);
                            const hotspotValue = Object.assign({}, hotspot, dataObj);
                            await bzdb.updateOrInsert('launchpadShared', launchpadValue);
                            await bzdb.updateOrInsert('hotspotShared', hotspotValue);
                        }
                    } catch (error) {
                        this.log4import.getLogger().error(error);
                        import_result = false;
                    }
                }
            };
        
            if ( import_result ) {
                return true;
            }
            return false;
        }
    }
    async doImportClkpad(params) {
        const context = this.context;
        var dirkey = params.dirkey;
        var wcUpgradeData = await this.upgradeDataService.getWCdata(dirkey, true);
        var wcclickpads = JSON.parse(wcUpgradeData);
        if(wcclickpads==undefined) this.log4import.getLogger('warn').warn("clk:clk | clk folder not exists");
        let import_result = true;
        var isShared = true;
        if(dirkey.toString().toLowerCase().indexOf("admin")==-1)//private
            isShared = false;
        var table = 'preferenceShared';
        if(!isShared) table = 'launchpadPrivate';
        if(!isShared) {
            var result = await this.setClkpadPrivate(table,wcclickpads,params);
            if(result)
            {
                return true;
            }
            else
            {
                this.log4import.getLogger().error('Clkpad import failed.');
                return false;
            }
        }
        else {
           return true; //there are no global clkpads in WC
        }
    }
    async doImportHotspot(params) {
        const context = this.context;
        var dirkey = params.dirkey;
        var wcUpgradeData = await this.upgradeDataService.getWCdata(dirkey, true);
        let import_result = true;
        var isShared = true;
        if(dirkey.toString().toLowerCase().indexOf("admin")==-1)//private
            isShared = false;
        var wchotspots = JSON.parse(wcUpgradeData);
        if(wchotspots==undefined) this.log4import.getLogger('warn').warn("hsp:hsp | hsp folder not exists");
        var table = 'hotspotShared';
        if(!isShared) table = 'hotspotPrivate';
        if(!isShared) {
            var result = await this.setHotSpotPrivate(table,wchotspots,params);
            if(result)
            {
                return true;
            }
            else
            {
                this.log4import.getLogger().error('import private hotspot failed.');
                return false;
            }
        }
        else
        {
            for (let key in wchotspots) {
                let wchotspot = wchotspots[key];
                let filename = key.substring(0,key.indexOf("."));
                if (filename.length==0)
                    filename = key.substring(0,key.length);
                //console.log(wchotspot);
                let wc2rteFuncs = {};
                if (wchotspot.Configuration.Emulation === "3270") {
                    wc2rteFuncs = this.wc2rte3270Funcs;
                }
                else if (wchotspot.Configuration.Emulation === "5250") {
                    wc2rteFuncs = this.wc2rte5250Funcs;
                }

                let matched = false; //no matches so far

                let rs1 = await bzdb.select('sessionSettingMapping');
                for(var i=0;i<rs1.data.length;i++) //look for all possible matches in the global session settings
                {
                    let launchpad = {};
                    let hotspot = {};
                    let newId = "";
                    let sname=rs1.data[i].name.split("_");
                    let name = sname[1] || sname[0];
                    if (name.indexOf(filename)>=0) {
                        matched = true;
                        newId = rs1.data[i].id;
                        //need to get existing settings and then overwrite just color values
                        try {
                            hotspot = this.utiles.ReadHotSpotFile(wchotspot.Configuration.Emulation, newId);
                            launchpad = this.utiles.ReadLaunchPadFile(wchotspot.Configuration.Emulation, newId);
                        }
                        catch {
                            hotspot = await this.sessionSettingsService.getDefaultHotspots(wchotspot.Configuration.Emulation);
                            launchpad = await this.sessionSettingsService.getDefaultLaunchpad(wchotspot.Configuration.Emulation);
                        }

                        hotspot.hotspotDefs = [];
                        for (let key2 in wchotspot.HotSpots) {
                            let hs = wchotspot.HotSpots[key2];
                            let rteFunc = "";
                            let rteHS = {};
                            if(wc2rteFuncs[hs.toLowerCase()] != undefined) {
                                rteFunc = wc2rteFuncs[hs.toLowerCase()];
                                if ( rteFunc != '') {
                                    //console.log("Text: " + key2 + ", WCFunc: " + hs + ", RTEFunc: " + rteFunc);
                                    rteHS["textToMatch"] = key2;
                                    rteHS["caseSensitive"] = true;
                                    rteHS["terminateWithSpace"] = false;
                                    if (wchotspot.Configuration.Emulation === "3270") {
                                        rteHS["actionType"] = "KEYMAP_TYPE_3270FUNCTION";
                                    }
                                    else {
                                        rteHS["actionType"] = "KEYMAP_TYPE_5250FUNCTION";
                                    }
                                    rteHS["actionValue"] = "<" + rteFunc + ">";
                                    hotspot.hotspotDefs.push(rteHS);
                                }
                            }
                        }

                        const dataObj = {timestamp: Date.now(), id: newId };
                        var override = params.override;
                        if(override=="true"||override==true) {
                            try {
                                const hotspotValue = Object.assign({}, hotspot, dataObj);
                                let rs = await bzdb.updateOrInsert('hotspotShared', hotspotValue);
                                if(rs!=undefined && rs.status) {
                                    this.hspSucessCount++;
                                    this.log4import.getLogger().info("update or insert hotspot "+wchotspot.Description.Description+ "(" + newId +") successfully");
                                }  
                                const launchpadValue = Object.assign({}, launchpad, dataObj);
                                await bzdb.updateOrInsert('launchpadShared', launchpadValue);
                            } catch (error) {
                                this.log4import.getLogger().error(error);
                                import_result = false;
                            }
                        }
                    }
                }

                if (!matched) {
                    let bNew;
                    let prefs = {};
                    let launchpad = {};
                    let hotspot = {};
                    let utiles=new Utiles(context);
                    let newId = await utiles.getIdByName("sessionSetting", filename)
                    if ( newId === "" ) {
                        newId = await utiles.ensureMapping("sessionSetting",wchotspot.Configuration.Emulation,filename);
                        prefs = await this.sessionSettingsService.getDefaultPreference(wchotspot.Configuration.Emulation); //bring in default preferences because just colors cause the UI to misbehave
                        launchpad = await this.sessionSettingsService.getDefaultLaunchpad(wchotspot.Configuration.Emulation);
                        hotspot = await this.sessionSettingsService.getDefaultHotspots(wchotspot.Configuration.Emulation);
                        bNew = true;
                    }
                    else
                    {
                        //need to get existing settings and then overwrite just color values
                        hotspot = this.utiles.ReadHotSpotFile(wchotspot.Configuration.Emulation, newId);
                        bNew = false;
                    }

                    hotspot.hotspotDefs = [];
                    for (let key2 in wchotspot.HotSpots) {
                        let hs = wchotspot.HotSpots[key2];
                        let rteFunc = "";
                        let rteHS = {};
                        if(wc2rteFuncs[hs.toLowerCase()] != undefined) {
                            rteFunc = wc2rteFuncs[hs.toLowerCase()];
                            if ( rteFunc != '') {
                                //console.log("Text: " + key2 + ", WCFunc: " + hs + ", RTEFunc: " + rteFunc);
                                rteHS["textToMatch"] = key2;
                                rteHS["caseSensitive"] = true;
                                rteHS["terminateWithSpace"] = false;
                                if (wchotspot.Configuration.Emulation === "3270") {
                                    rteHS["actionType"] = "KEYMAP_TYPE_3270FUNCTION";
                                }
                                else {
                                    rteHS["actionType"] = "KEYMAP_TYPE_5250FUNCTION";
                                }
                                rteHS["actionValue"] = "<" + rteFunc + ">";
                                hotspot.hotspotDefs.push(rteHS);
                            }
                        }
                    }
                    const dataObj = {timestamp: Date.now(), id: newId };
                    try {
                        const prefsValue = Object.assign({}, prefs, dataObj);
                        const hotspotValue = Object.assign({}, hotspot, dataObj);
                        bzdb.updateOrInsert('preferenceShared', prefsValue);
                        if (bNew) {
                            const launchpadValue = Object.assign({}, launchpad, dataObj);
                            await bzdb.updateOrInsert('launchpadShared', launchpadValue);
                        }
                        let rs = await bzdb.updateOrInsert('hotspotShared', hotspotValue);
                        if(rs!=undefined && rs.status)
                            this.log4import.getLogger().info("update or insert hotspot "+wchotspot.Description.Description+ "(" + newId +") successfully");
                    } catch (error) {
                        this.log4import.getLogger().error(error);
                        import_result = false;
                    }
                }
            };
            
            if ( import_result ) {
                return true;
            }
            return false;
        }
    }
    async clearLog(params) {
        var infoLog =  this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/history/"+"import.log";
        var errorLog =  this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/history/"+"error.log";
        var warningLog =  this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/history/"+"warn.log";

        if(fs.existsSync(infoLog)) 
        {
            fs.writeFileSync(infoLog,"");
        }
        if(fs.existsSync(errorLog)) 
        {
            fs.writeFileSync(errorLog,"");
        }
        if(fs.existsSync(warningLog)) 
        {
            fs.writeFileSync(warningLog,"");
        }
    }

    async getSessionName(session,key) {
        var sesName = key;
        try {
            if(session != undefined && session.Description!= undefined)
            {
                if(session.Description.Description!=undefined && session.Description.Description.length>0)
                    sesName = session.Description.Description+"";
                else if(session.Network!=undefined &&session.Network.HostName!=undefined)
                sesName = session.Network.HostName+"";
            }
            if(sesName!=undefined)
            sesName = sesName.substring(0,64).replace(/\W^[@]/g,"_");
        } catch (error) {
            this.log4import.getLogger().error(error.stack);
        }
        return sesName;
    }

    async getSessionLabel(session,key) {
        var sesLabel = '';
        try {
            if(session != undefined && session.Description!= undefined)
            {
                if(session.Description.Label!=undefined && session.Description.Label.length>0)
                sesLabel = session.Description.Label+"";
            }
            if(sesLabel!=undefined)
            sesLabel = sesLabel.substring(0,64).replace(/\W^[@]/g,"_");
        } catch (error) {
            this.log4import.getLogger().error(error.stack);
        }
        return sesLabel;
    }
    /**
     * get webconnect session's window title
     * @param {*} session 
     * @param {*} key 
     * @returns 
     */
    async getSessionTitle(session,key) {
        var sesTitle = '';
        try {
            if(session != undefined && session.Description!= undefined)
            {
                if(session.Description.Title!=undefined && session.Description.Title.length>0)
                sesTitle = session.Description.Title+"";
            }
            if(sesTitle!=undefined)
            sesTitle = sesTitle.substring(0,64).replace(/\W^[@]/g,"_");
        } catch (error) {
            this.log4import.getLogger().error(error.stack);
        }
        return sesTitle;
    }
    async getKeymapName(keymap) {
        var kname = "";
        if(keymap!=undefined && keymap.Keymap!=undefined)
        {
            kname = keymap.Keymap.Description;
            if(kname!=undefined&&kname.length>0)
            kname = kname.substring(0,32).replace(/\W^[@]/g,"_");
        }
        return kname;
    }

    async doImportRelation(params) {
        var wcUpgradeData = await this.upgradeDataService.getWCdata(params.dirkey);
            var sessions = JSON.parse(wcUpgradeData);
            let rs1 = await bzdb.select('sessionShared');
            if(rs1==undefined || rs1.rowCount <= 0) return;

            var wcUpgradeData2 = await this.upgradeDataService.getWCdata("admin_atm");
            var admin_attribs = JSON.parse(wcUpgradeData2);
            var wcUpgradeData3 = await this.upgradeDataService.getWCdata("admin_hsp");
            var admin_hotspots = JSON.parse(wcUpgradeData3);
            
            for(var i=0;i<rs1.rowCount;i++)
            {//loop all session
                let key = "";
                try{
                    let sid = rs1.data[i].id;
                    let ses_id_array = sid.split("-");
                    key = sid;
                    if(ses_id_array.length>=2)
                    {
                        key = ses_id_array[1];//if session name like Default 3270 Session - WC0000013  ,give webconnect id WC0000013
                    }
                    let session = sessions[key];
                    var values ={};
                    var type = "";
                    if(session == undefined || session.Configuration == undefined)
                    {
                        continue;
                    }else{
                        type = session.Configuration.Emulation;// session connection type
                    }
                    if(session.Display!=undefined)
                    {
                        var sessionKM = session.Display.SessionKM;
                        if(sessionKM!=undefined&&sessionKM.length>0)
                        {//set keyboardmapping for session
                            let allkeymaps = await this.upgradeDataService.getWCdata("admin_keymap");
                            let keymaps = JSON.parse(allkeymaps);
                            sessionKM = sessionKM.toString().substring(0,sessionKM.toString().indexOf("."));
                            var name = (keymaps[sessionKM]!=undefined && keymaps[sessionKM].Keymap!=undefined) ?keymaps[sessionKM].Keymap.Description:"";
                            const rs = await bzdb.select('keyboardMappingShared', {name: name});
                            var keyboardId = (rs.data.length>0&&rs.data[0].id!=undefined)?rs.data[0].id:"";
                            values.keyboardMapping = (keyboardId!=undefined)?keyboardId:"";
                            if(values.keyboardMapping!=undefined && values.keyboardMapping.length<=0){
                                let defaultKeymap = await this.getDefaultKeymap(type);
                                values.keyboardMapping = defaultKeymap;
                            }
                        }else
                        {
                            values.keyboardMapping = await this.getDefaultKeymap(type);
                        }
                        await this.determineSessionSettings(values,session,type,admin_attribs,admin_hotspots,false);
                    }
                    let rs = await bzdb.select('sessionShared', {id: sid});
                    if (rs.rowCount > 0){//to override
                        var override = params.override;
                        if(override=="true"||override==true)
                        {
                            
                            if(rs.rowCount>0)
                            {
                                if(rs.data[0]!=undefined)
                                {
                                    values.id = rs.data[0].id;
                                    var sessionName = rs.data[0].name;
                                    rs=await bzdb.updateOrInsert('sessionShared', values);
                                    if(rs.status)
                                    this.log4import.getLogger().info(' update session id:'+values.id+'/session name:'+sessionName+' successfully');
                                }
                                
                            }                       
                        }else
                        {
                                this.log4import.getLogger().warn("Session '"+values.name+"' already exists");
                                continue;
                        }
                    
                    }
                }catch(error){
                    this.log4import.getLogger().error('update session '+key+' error:'+error.stack);
                    }
                }
        return true;
    }

    async getWCName(sessions,name) {
        var sesName = "";
        try {
            for(let key of Object.keys(sessions)) 
            {//loop all sessions
                let session = sessions[key];
                sesName = "";
                if(session != undefined && session.Description!= undefined)
                {
                    if(session.Description.Label!=undefined && session.Description.Label.length>0)
                        sesName = session.Description.Label+"";
                    else if(session.Description.Description!=undefined && session.Description.Description.length>0)
                        sesName = session.Description.Description+"";
                    else if(session.Network!=undefined &&session.Network.HostName!=undefined)
                        sesName = session.Network.HostName+"";
                }
                if(sesName!=undefined) {
                    if (sesName == name) {
                        return key;
                    }
                }
            }
        } catch (error) {
            this.log4import.getLogger().error(error.stack);
        }
        return sesName;
    }

    async hasMatched(RTEkey,wckey)
    {
        var hasMatched = false;
        if(RTEkey.key==wckey)
        {
            hasMatched = true;
        }else if(RTEkey.key=="Key"+wckey.toUpperCase()||RTEkey.key=="Digit"+wckey.toUpperCase())
        {
            hasMatched = true;
        }else if( /[a-zA-Z]/.test(wckey) && RTEkey.key.toLowerCase()=="numpad"+wckey.toLowerCase())
        {//JSTE-7106 Command key should migrate to Command and NumapadCmd
            hasMatched = true;
        }
        return hasMatched;
    }

    async hasHistroy()
    {
        var filename = "history.txt";
            var path = this.instanceDir+"/ZLUX/pluginStorage/com.rs.bzadm/history";
            var dataFromFile = await this.readFilePromise(path, filename);
            var data = Array.from(dataFromFile);
            if(data)
            {
                if(data.length)
                    {
                        return true;
                    }else{
                        return false;
                    }
                
            }else{
                return false;
            }
    }

    async getLUname(session)
    {
        var luName = "";
        if(session.TN!=undefined && session.TN.DeviceNameList!=undefined)
        {
            var devices = session.TN.DeviceNameList.split(" ");
            if(devices.length>1)
            {
                luName = devices[0];
            }else{
                luName = devices+"";
            }
        }else
        {
            luName = "";
        }
        return luName;
    }
    //LDAP search
     search(_client,options) {
        return new Promise(function(resolve, reject) {
            var rows = [];
            var opt = {
                scope: options.scope || 'one',
                paged: options.paged || true,
                filter: options.filter,
                attributes: options.attributes,
                attrsOnly:options.attrsOnly || false
            };
            _client.search(options.base, opt, function(err, res){
                if (err) {
                    reject(err);
                }
                res.on('searchEntry', function(entry) {
                    rows.push(entry.object);
                });
                res.on('page', function(result) {
                    console.log('paging');
                });
                res.on('error', function(err) {
                    reject(err);
                });
                res.on('end', function(result) {
                    resolve(rows);
                });
            });
        });
    };
    //get default server level or global keymap 
    async getDefaultKeymap(type)
    {
        let sessionKM = "";
        let values = {}; values.keyboardMapping = "";
        if(type=="3270")
        {
            sessionKM = "WC_Server_3";
            const rs = await bzdb.select('keyboardMappingShared', {name: sessionKM});
            if(rs.rowCount>0)
            {
                var keyboardId = (rs.data.length>0&&rs.data[0].id!=undefined)?rs.data[0].id:"";
                values.keyboardMapping = (keyboardId!=undefined)?keyboardId:"";
            }else{
                sessionKM = "WC_G_3";
                const rs = await bzdb.select('keyboardMappingShared', {name: sessionKM});
                var keyboardId = (rs.data.length>0&&rs.data[0].id!=undefined)?rs.data[0].id:"";
                    values.keyboardMapping = (keyboardId!=undefined)?keyboardId:"";
                }
                                
        }else if(type=="5250")
        {
            sessionKM = "WC_Server_5";
            const rs = await bzdb.select('keyboardMappingShared', {name: sessionKM});
            if(rs.rowCount>0)
            {
                var keyboardId = (rs.data.length>0&&rs.data[0].id!=undefined)?rs.data[0].id:"";
                    values.keyboardMapping = (keyboardId!=undefined)?keyboardId:"";
            }else{
                sessionKM = "WC_G_5";
                const rs = await bzdb.select('keyboardMappingShared', {name: sessionKM});
                var keyboardId = (rs.data.length>0&&rs.data[0].id!=undefined)?rs.data[0].id:"";
                    values.keyboardMapping = (keyboardId!=undefined)?keyboardId:"";
                }
                                
        }else if(type=="VT")
        {
                sessionKM = "WC_Server_VT";
                const rs = await bzdb.select('keyboardMappingShared', {name: sessionKM});
                if(rs.rowCount>0)
                {
                    var keyboardId = (rs.data.length>0&&rs.data[0].id!=undefined)?rs.data[0].id:"";
                    values.keyboardMapping = (keyboardId!=undefined)?keyboardId:"";
                }else{
                    sessionKM = "WC_G_VT";
                    const rs = await bzdb.select('keyboardMappingShared', {name: sessionKM});
                    var keyboardId = (rs.data.length>0&&rs.data[0].id!=undefined)?rs.data[0].id:"";
                    values.keyboardMapping = (keyboardId!=undefined)?keyboardId:"";
                }
                                
        }

        return values.keyboardMapping;
    }

    async isMatched(row,agency){
        try {
            if(agency && Object.keys(agency).length ===0 ){
                return true;
            }else {
                let checkedAgency = agency.filter(e => e.checked);
                if (checkedAgency.length===0) return true;
            } 
            if(row.ocConfigName && row.ocConfigName.indexOf('ses/') >= 0) {
                let sesName = row.ocConfigName.substring(row.ocConfigName.indexOf('ses/'));
                let matchedSes = agency.filter(e => e.id.length>0 && sesName.indexOf(e.id)>=0 && e.checked);
                let matchedDefSes = this.defaultSes.filter(e => sesName.indexOf(e)===4);
                return matchedSes.length>0 || matchedDefSes.length>0;
            } else if(row.ocConfigName && row.ocConfigName.indexOf('users/') >= 0){
                let matchedUsers = agency.filter(e => (row.ocConfigName.indexOf('@')>=0 && e.checked && row.ocConfigName.indexOf(e.key) >= 0));
                return matchedUsers.length>0;
            } else {
                let matchedAgency = agency.filter(e => (row.ocConfigName.indexOf('@')>=0 && e.checked && row.ocConfigName.indexOf(e.key) >= 0) || row.ocConfigName.indexOf('@')<0);
                return matchedAgency.length>0;
            }
        } catch (error) {
            return false;
        }
    }

}

exports.upgradeRouter = (context) => {
    return new Promise(function (resolve, reject) {
        let controller = new UpgradeRouter(context);
        controller.getUpgradeRouter();
        resolve(controller.getRouter());
    });
};
