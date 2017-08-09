/**
 * @license
 * Blockly Demos: Block Factory
 *
 * Copyright 2017 Google Inc.
 * https://developers.google.com/blockly/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview AppController controls all parts of the application by creating
 * sub-controllers (ProjectController, WorkspaceController) which individually
 * control specific parts of application. AppController is the central part of
 * DevTools which initializes all other parts of the application.
 *
 * @authors sagev@google.com (Sage Vouse), celinechoo (Celine Choo)
 */

goog.provide('AppController');
goog.provide('PREFIXES');

goog.require('AppView');
goog.require('EditorController');
goog.require('FactoryUtils');
goog.require('NewBlockPopupController');
goog.require('NewLibraryPopupController');
goog.require('NewProjectPopupController');
goog.require('PopupController');
goog.require('SaveProjectPopupController');
goog.require('Project');
goog.require('ProjectController');

goog.require('goog.dom.classlist');
goog.require('goog.dom.xml');
goog.require('goog.ui.PopupColorPicker');
goog.require('goog.ui.ColorPicker');


'use strict';

var Emitter = require('component-emitter');
var fs = require('graceful-fs');
var path = require('path');

/**
 * Class containing static getters for the prefixes of all node types. Given
 * with the assumption that the name of each object in a project is unique
 * across that project.
 */
class PREFIXES {
  static get PROJECT() {
    return 'Project';
  }
  static get BLOCK() {
    return 'Block';
  }
  static get LIBRARY() {
    return 'BlockLibrary';
  }
  static get TOOLBOX() {
    return 'Toolbox';
  }
  static get GENERAL_WORKSPACE() {
    return 'Workspace';
  }
  static get WORKSPACE_CONTENTS() {
    return 'WorkspaceContents';
  }
  static get WORKSPACE_CONFIG() {
    return 'WorkspaceConfiguration';
  }

  /* prefixes for classes when used in variable names */
  static get VARIABLE_BLOCK() {
    return 'block';
  }
  static get VARIABLE_TOOLBOX() {
    return 'toolbox';
  }
  static get VARIABLE_WORKSPACECONTENTS() {
    return 'workspaceContents';
  }
  static get VARIABLE_WORKSPACECONFIGURATION() {
    return 'workspaceConfig';
  }
}

class AppController {
  /**
   * Initializes AppController, creates project object, associated controllers
   * and views.
   * @constructor
   */
  constructor() {
    // Block Factory has a dependency on bits of Closure that core Blockly
    // doesn't have. When you run this from file:// without a copy of Closure,
    // it breaks it non-obvious ways.  Warning about this for now until the
    // dependency is broken.
    // TODO: #668.
    if (!window.goog.dom.xml) {
      alert('Sorry: Closure dependency not found. We are working on removing ' +
        'this dependency.  In the meantime, you can use our hosted demo\n ' +
        'https://blockly-demo.appspot.com/static/demos/blockfactory/index.html' +
        '\nor use these instructions to continue running locally:\n' +
        'https://developers.google.com/blockly/guides/modify/web/closure');
      return;
    }

    /**
     * Stores currently loaded project that user will edit.
     * @type {Project}
     */
    this.project = null;

    /**
     * The tree for the DevTools session.
     * @type {NavigationTree}
     */
    this.tree = null;

    /**
     * ProjectController object associated with application.
     * @type {ProjectController}
     */
    this.projectController = null;

    // Create div elements to insert hidden workspaces used in I/O. Hidden
    // workspaces stored in EditorController.
    this.insertHiddenWorkspace_();

    /**
     * Hidden Blockly workspace used to generate Blockly objects by using
     * core Blockly functions.
     * @type {!Blockly.Workspace}
     */
    this.hiddenWorkspace = Blockly.inject('hiddenWorkspace');

    /**
     * EditorController object which encapsulates all editor controllers
     * @type {EditorController}
     */
    this.editorController = null;

    /**
     * Main View class which manages view portion of application.
     * @type {AppView}
     */
    this.view = null;

    /**
     * PopupController object which controls any popups that may appear throughout
     * the course of using DevTools. Null if no popup is open.
     * @type {?PopupController}
     */
    this.popupController = null;

    /**
     * ReadWriteController, which controls reading/writing project data.
     */
    this.readWriteController = new ReadWriteController(this);

    // Creates project.
    // this.initProject('MyProject');
    this.initProjectForDemo();
  }

  // ======================== CONSTANTS ===========================
  // TODO: Remove/add tabs to fit new DevTools model.
  /**
   * Static get function for constant BLOCK_EDITOR. Represents one of the
   * three tabs in the controller.
   * @return {!string}
   */
  static get BLOCK_EDITOR() {
    return 'BLOCK_EDITOR';
  }

  /**
   * Static get function for constant EXPORTER. Represents one of the three tabs
   * in the controller.
   * @return {!string}
   */
  static get EXPORTER() {
    return 'EXPORTER';
  }

  /**
   * Static get function for constant TOOLBOX_EDITOR.
   * @return {!string}
   */
  static get TOOLBOX_EDITOR() {
    return 'TOOLBOX_EDITOR';
  }

  /**
   * Static get function for constant WORKSPACE_EDITOR.
   * @return {!string}
   */
  static get WORKSPACE_EDITOR() {
    return 'WORKSPACE_EDITOR';
  }

  /**
   * Handle Blockly Storage with App Engine.
   */
  initializeBlocklyStorage() {
    // REFACTORED: Moved in from app_controller.js
    // TODO: Possibly remove method if unnecessary.
    BlocklyStorage.HTTPREQUEST_ERROR =
        'There was a problem with the request.\n';
    BlocklyStorage.LINK_ALERT =
        'Share your blocks with this link:\n\n%1';
    BlocklyStorage.HASH_ERROR =
        'Sorry, "%1" doesn\'t correspond with any saved Blockly file.';
    BlocklyStorage.XML_ERROR = 'Could not load your saved file.\n' +
        'Perhaps it was created with a different version of Blockly?';
    const linkButton = document.getElementById('linkButton');
    linkButton.style.display = 'inline-block';
    linkButton.addEventListener('click', () => {
        BlocklyStorage.link(
          this.editorController.blockEditorController.view.blockDefinitionWorkspace);
      });
    this.editorController.blockEditorController.view.disableEnableLink();
  }

  /**
   * Creates invisible/hidden Blockly workspace that is used as a tool in
   * generating XML of blocks.
   * @private
   */
  insertHiddenWorkspace_() {
    const hiddenDiv = document.createElement('div');
    hiddenDiv.id = 'hiddenWorkspace';
    hiddenDiv.style.display = 'none';
    document.body.appendChild(hiddenDiv);
  }

  /**
   * Prompts user to either open a preexisting project or create a new project.
   */
  openProject() {
    // TODO: Implement.
    console.warn('Unimplemented: openProject()');
  }

  /**
   * Creates new project with the proper user-given name, then initializes
   * controllers and components of application dependent on the project.
   * @param {string} projectName Name of project (user-given).
   */
  initProject(projectName) {
    this.project = new Project(projectName);
    this.tree = new NavigationTree(this);
    this.projectController = new ProjectController(this.project, this.tree);
    this.editorController = new EditorController(this.projectController,
        this.hiddenWorkspace);
    this.view = new AppView(this);

    // Registers event listener which populates tree with project resources
    // when the tree is fully loaded. Event can only be registered after
    // project controller is created because populateTree() references the
    // project controller.
    this.tree.ready(() => {
      // TODO(#200): Populate project model before simply refreshing tree.
      this.populateTree();
    });
  }

  initProjectForDemo() {
    this.project = new Project('Blockly Maze Game');
    this.tree = new NavigationTree(this);
    this.projectController = new ProjectController(this.project, this.tree);
    this.editorController = new EditorController(this.projectController,
        this.hiddenWorkspace);
    this.view = new AppView(this);

    this.tree.ready(() => {
      if (Object.keys(this.project.librarySet.resources).length > 0) {
        return;
      }
      this.populateDemo();
    });
  }

  populateDemo() {
    this.projectController.createToolbox('Level 1 Toolbox');
    this.projectController.createWorkspaceContents('Level 1 Workspace');
    this.projectController.createBlockLibrary('MazeBlocks');
    let demoXmls = Object.create(null);
    demoXmls['forward'] = `
<xml xmlns="http://www.w3.org/1999/xhtml">
  <variables></variables>
  <block type="factory_base" id="U9b}_mOOT.(W!^88fs]:" deletable="false" movable="false" x="0" y="0">
    <mutation connections="BOTH"></mutation>
    <field name="NAME">forward</field>
    <field name="INLINE">AUTO</field>
    <field name="CONNECTIONS">BOTH</field>
    <statement name="INPUTS">
      <block type="input_dummy" id="laWw,*zs/gz0/S%}L)4Z">
        <field name="ALIGN">LEFT</field>
        <statement name="FIELDS">
          <block type="field_static" id="$t15,~*g|Q?[9UR$Fb$?">
            <field name="TEXT">move forward</field>
          </block>
        </statement>
      </block>
    </statement>
    <value name="TOOLTIP">
      <block type="text" id="ox2~;\`PjT{vPt(iRGk,9" deletable="false" movable="false">
        <field name="TEXT"></field>
      </block>
    </value>
    <value name="HELPURL">
      <block type="text" id="dV~M6ri|QDemFY[m7@MQ" deletable="false" movable="false">
        <field name="TEXT"></field>
      </block>
    </value>
    <value name="TOPTYPE">
      <shadow type="type_null" id="S::gn94.+UE)yGD9e]\`%"></shadow>
    </value>
    <value name="BOTTOMTYPE">
      <shadow type="type_null" id="Wtw;\`4HdRoMFWR6sTnD\`"></shadow>
    </value>
    <value name="COLOUR">
      <block type="colour_hue" id="p4rZcLbO|6#t*wEuMl{f">
        <mutation colour="#935ba5"></mutation>
        <field name="HUE">285</field>
      </block>
    </value>
  </block>
  <block type="input_statement" id="A=R52OR:Hvm;ntDNV}k." disabled="true" x="231" y="407">
    <field name="INPUTNAME">NAME</field>
    <field name="ALIGN">LEFT</field>
  </block>
</xml>
`;
    demoXmls['turn'] = `
<xml xmlns="http://www.w3.org/1999/xhtml">
  <variables></variables>
  <block type="factory_base" id="UDe)r(G(1EZ)c)dj,:E:" deletable="false" movable="false" x="0" y="0">
    <mutation connections="BOTH"></mutation>
    <field name="NAME">turn</field>
    <field name="INLINE">AUTO</field>
    <field name="CONNECTIONS">BOTH</field>
    <statement name="INPUTS">
      <block type="input_dummy" id="/+11wBQu3/![iiOMJ6JQ">
        <field name="ALIGN">LEFT</field>
        <statement name="FIELDS">
          <block type="field_static" id="vImtT+Km%Ys(N:9ue:w.">
            <field name="TEXT">turn</field>
            <next>
              <block type="field_dropdown" id="2)[Ym9_wyTrZi67*=/VU">
                <mutation options="[&quot;text&quot;,&quot;text&quot;]"></mutation>
                <field name="FIELDNAME">turn_direction</field>
                <field name="USER0">left ↺</field>
                <field name="CPU0">turn_left</field>
                <field name="USER1">right ↻</field>
                <field name="CPU1">turn_right</field>
              </block>
            </next>
          </block>
        </statement>
      </block>
    </statement>
    <value name="TOOLTIP">
      <block type="text" id="V:g7i[}e}@dY-.N%PG2z" deletable="false" movable="false">
        <field name="TEXT"></field>
      </block>
    </value>
    <value name="HELPURL">
      <block type="text" id="q4E5;*h]$=[Y3d@X1*|I" deletable="false" movable="false">
        <field name="TEXT"></field>
      </block>
    </value>
    <value name="TOPTYPE">
      <shadow type="type_null" id="6Z**#M:72p{@2pW0aw-t"></shadow>
    </value>
    <value name="BOTTOMTYPE">
      <shadow type="type_null" id=".8k{{tZ9cP!.\`VLs|u4q"></shadow>
    </value>
    <value name="COLOUR">
      <block type="colour_hue" id="FgzTGy+S#u^@oPQZ=[Mg">
        <mutation colour="#935ba5"></mutation>
        <field name="HUE">285</field>
      </block>
    </value>
  </block>
</xml>
`;
    demoXmls['repeat_until'] = `
<xml xmlns="http://www.w3.org/1999/xhtml">
  <variables></variables>
  <block type="factory_base" id="h%nmRkcr2q2=FzdecE1K" deletable="false" movable="false" x="0" y="0">
    <mutation connections="BOTH"></mutation>
    <field name="NAME">repeat_until</field>
    <field name="INLINE">AUTO</field>
    <field name="CONNECTIONS">BOTH</field>
    <statement name="INPUTS">
      <block type="input_dummy" id="[4,VBNgHRUd:SX|-QiI6">
        <field name="ALIGN">LEFT</field>
        <statement name="FIELDS">
          <block type="field_static" id="pY%!ay$U;e2}McYG0%NS">
            <field name="TEXT">repeat until</field>
            <next>
              <block type="field_image" id="^VY3S=wuO1\`H5mi=%d|\`">
                <field name="SRC">http://www.clker.com/cliparts/j/4/f/Y/g/Q/orange-pin-hi.png</field>
                <field name="WIDTH">15</field>
                <field name="HEIGHT">15</field>
                <field name="ALT">*</field>
              </block>
            </next>
          </block>
        </statement>
        <next>
          <block type="input_statement" id="YCH(GJmRwPMj[?Acy2Zp">
            <field name="INPUTNAME">NAME</field>
            <field name="ALIGN">LEFT</field>
            <statement name="FIELDS">
              <block type="field_static" id="h]WYLYz+mH%xt9w_jJ6.">
                <field name="TEXT">do</field>
              </block>
            </statement>
            <value name="TYPE">
              <shadow type="type_null" id="8u=XF[wycctB4DjhtXAr"></shadow>
            </value>
          </block>
        </next>
      </block>
    </statement>
    <value name="TOOLTIP">
      <block type="text" id="IR*G8,)@+{pyI]jPY-wF" deletable="false" movable="false">
        <field name="TEXT"></field>
      </block>
    </value>
    <value name="HELPURL">
      <block type="text" id="q%SEnUPM21B!A^RC77#1" deletable="false" movable="false">
        <field name="TEXT"></field>
      </block>
    </value>
    <value name="TOPTYPE">
      <shadow type="type_null" id="..y]b(n}B%|hR\`CiK^DH"></shadow>
    </value>
    <value name="BOTTOMTYPE">
      <shadow type="type_null" id="n:NqR8;HWG;Us~EW5e44"></shadow>
    </value>
    <value name="COLOUR">
      <block type="colour_hue" id="E:d=xsRhrL*uI~G0cQw2">
        <mutation colour="#5ba55b"></mutation>
        <field name="HUE">120</field>
      </block>
    </value>
  </block>
</xml>
`;

    demoXmls['path_do'] = `
<xml xmlns="http://www.w3.org/1999/xhtml">
  <variables></variables>
  <block type="factory_base" id="G1CY-ZgrjRwDANg*|Z|7" deletable="false" movable="false" x="0" y="0">
    <mutation connections="BOTH"></mutation>
    <field name="NAME">path_do</field>
    <field name="INLINE">AUTO</field>
    <field name="CONNECTIONS">BOTH</field>
    <statement name="INPUTS">
      <block type="input_dummy" id="^dl^;^c/!WG1_r3=Np8M">
        <field name="ALIGN">LEFT</field>
        <statement name="FIELDS">
          <block type="field_static" id="}$\`_*X-$KfG[QF7J%mc$">
            <field name="TEXT">if path</field>
            <next>
              <block type="field_dropdown" id="}m=a7CEKF(H|xPgB(i2F">
                <mutation options="[&quot;text&quot;,&quot;text&quot;,&quot;text&quot;]"></mutation>
                <field name="FIELDNAME">path_direction</field>
                <field name="USER0">ahead</field>
                <field name="CPU0">ahead</field>
                <field name="USER1">to the left ↺</field>
                <field name="CPU1">left</field>
                <field name="USER2">to the right ↻</field>
                <field name="CPU2">right</field>
              </block>
            </next>
          </block>
        </statement>
        <next>
          <block type="input_statement" id="a*g4],+wLe{4}bvlVfEo">
            <field name="INPUTNAME">path_do_do</field>
            <field name="ALIGN">LEFT</field>
            <statement name="FIELDS">
              <block type="field_static" id="X+dbKw{]JZ,\`!O\`=Fomg">
                <field name="TEXT">do</field>
              </block>
            </statement>
            <value name="TYPE">
              <shadow type="type_null" id="_f+SO5J5_GjDh;=Y,BYH"></shadow>
            </value>
          </block>
        </next>
      </block>
    </statement>
    <value name="TOOLTIP">
      <block type="text" id="bc]DUaZQeP:cT!-.1Irv" deletable="false" movable="false">
        <field name="TEXT"></field>
      </block>
    </value>
    <value name="HELPURL">
      <block type="text" id="rUqNo.I%v21YsKBy_wHS" deletable="false" movable="false">
        <field name="TEXT"></field>
      </block>
    </value>
    <value name="TOPTYPE">
      <shadow type="type_null" id="ir$Wqg=!N~Q$qaUnpI2i"></shadow>
    </value>
    <value name="BOTTOMTYPE">
      <shadow type="type_null" id="f+UIO9Lffv0awG0u]bp4"></shadow>
    </value>
    <value name="COLOUR">
      <block type="colour_hue" id="YFQ|W3ud3F:]C:iY5h=z">
        <mutation colour="#5b80a5"></mutation>
        <field name="HUE">210</field>
      </block>
    </value>
  </block>
</xml>
`;

    demoXmls['path_do_else'] = `
<xml xmlns="http://www.w3.org/1999/xhtml">
  <variables></variables>
  <block type="factory_base" id="zMjgo6zja=lotUs^9i:6" deletable="false" movable="false" x="0" y="0">
    <mutation connections="BOTH"></mutation>
    <field name="NAME">path_do_else</field>
    <field name="INLINE">AUTO</field>
    <field name="CONNECTIONS">BOTH</field>
    <statement name="INPUTS">
      <block type="input_dummy" id="?!7g!9qiVDle:k-2[ko*">
        <field name="ALIGN">LEFT</field>
        <statement name="FIELDS">
          <block type="field_static" id="#P*He~M1CflNebeiy7M4">
            <field name="TEXT">if path</field>
            <next>
              <block type="field_dropdown" id="^q$:Tpk/O[#Ngw5YaNR9">
                <mutation options="[&quot;text&quot;,&quot;text&quot;,&quot;text&quot;]"></mutation>
                <field name="FIELDNAME">path_direction</field>
                <field name="USER0">ahead</field>
                <field name="CPU0">ahead</field>
                <field name="USER1">to the left ↺</field>
                <field name="CPU1">left</field>
                <field name="USER2">to the right ↻</field>
                <field name="CPU2">right</field>
              </block>
            </next>
          </block>
        </statement>
        <next>
          <block type="input_statement" id="~:b7k;?Y1Rq_,RI]?0Ta">
            <field name="INPUTNAME">direction</field>
            <field name="ALIGN">LEFT</field>
            <statement name="FIELDS">
              <block type="field_static" id="X)+h=S!!dR~PNm~@Duuo">
                <field name="TEXT">do</field>
              </block>
            </statement>
            <value name="TYPE">
              <shadow type="type_null" id=".J^y:]1cC3.8Yc_IQrzI"></shadow>
            </value>
            <next>
              <block type="input_statement" id="XIF-UyaV2X\`i@ItgZXp}">
                <field name="INPUTNAME">direction</field>
                <field name="ALIGN">LEFT</field>
                <statement name="FIELDS">
                  <block type="field_static" id="^#b1+uk!6_1@SFlD@,6y">
                    <field name="TEXT">else</field>
                  </block>
                </statement>
                <value name="TYPE">
                  <shadow type="type_null" id=")ld{M3M8ol]m\`{LWko3-"></shadow>
                </value>
              </block>
            </next>
          </block>
        </next>
      </block>
    </statement>
    <value name="TOOLTIP">
      <block type="text" id="W_PvbmDEH)eN$D*0K|:8" deletable="false" movable="false">
        <field name="TEXT"></field>
      </block>
    </value>
    <value name="HELPURL">
      <block type="text" id="rNuns+aiaTZn+(UiuTvT" deletable="false" movable="false">
        <field name="TEXT"></field>
      </block>
    </value>
    <value name="TOPTYPE">
      <shadow type="type_null" id="+a3%05WYeY3S=P=D/0=="></shadow>
    </value>
    <value name="BOTTOMTYPE">
      <shadow type="type_null" id=":[$/R@e1=\`L#6wYR^#^u"></shadow>
    </value>
    <value name="COLOUR">
      <block type="colour_hue" id=")Iya405ul5M4c,$mSFuW">
        <mutation colour="#5b80a5"></mutation>
        <field name="HUE">210</field>
      </block>
    </value>
  </block>
</xml>
`;
    for (let blockName in demoXmls) {
      this.editorController.blockEditorController.createNewBlock(
          '', blockName, 'MazeBlocks', blockName);
      const block = this.project.librarySet.resources['MazeBlocks'].blocks[blockName];
      this.editorController.blockEditorController.view.editorWorkspace.clear();
      Blockly.Xml.domToWorkspace(
          Blockly.Xml.textToDom(demoXmls[blockName]),
          this.editorController.blockEditorController.view.editorWorkspace);
      this.editorController.blockEditorController.updateBlockDefinition();
      this.editorController.blockEditorController.refreshPreviews();
    }

    // Setting toolbox XML
    const toolbox = this.projectController.project.getToolbox('Level 1 Toolbox');
    const toolboxXml = `
<xml xmlns="http://www.w3.org/1999/xhtml">
  <variables></variables>
  <block type="forward" id="m*W@*E1+krCG-Mlt{D|3" x="38" y="38"></block>
  <block type="turn" id="eBo)*u!lyn_7;#hG7Z}c" x="38" y="113">
    <field name="turn_direction">turn_left</field>
  </block>
  <block type="turn" id="jD0z-!JQ3c#T$ahPGZ)%" x="38" y="188">
    <field name="turn_direction">turn_right</field>
  </block>
  <block type="repeat_until" id="vtV@JxPxeEXZoh\`]Ku9x" x="38" y="263"></block>
</xml>
`;
    toolbox.setXml(toolboxXml);
    const toolboxController = this.editorController.toolboxController;
    toolboxController.view.toolbox = toolbox;
    toolboxController.loadToolbox(toolboxController.view.toolbox);
    toolboxController.setResource(toolboxController.view.toolbox);
    toolboxController.updateEditorToolbox();
  }

  /**
   * Populates navtree with sample resources.
   */
  populateTree() {
    // TODO(#200): Add resources to project before loading navtree, then refresh
    // navtree after first loaded.
    const projController = this.projectController;
    if (projController.getProject().librarySet.resources['MyFirstBlockLibrary']) {
      return;
    }
    projController.createToolbox('MyFirstToolbox');
    projController.createWorkspaceContents('MyFirstWorkspace');
    projController.createBlockLibrary('MyFirstBlockLibrary');
    this.editorController.blockEditorController.createNewBlock(
        '', 'myFirstBlock', 'MyFirstBlockLibrary', 'My Block');
  }

  /**
   * Top-level function which is first called in order to save a project to
   * developer's file system.
   */
  saveProject() {
    this.readWriteController.saveProject();
  }

  /**
   * Top-level function which is first called in order to create a sample
   * Blockly application with user-defined workspace, toolbox, and blocks.
   */
  saveSampleApplication() {
    // REFACTORED: Moved in from wfactory_controller.js:exportInjectFile()

    // Generate file contents for inject file.
    const injectFileContents = this.projectController.generateInjectString();
    // Get file name from user.
    const fileName = 'my_blockly_application.html';

    // TODO: Replace with node style file writing in the project's web export
    // directory.
    FactoryUtils.createAndDownloadFile(injectFileContents,
        fileName, 'application/xhtml+xml');
  }

  /**
   * Generates popup. Param must be either this.popupController.MODE.PREVIEW,
   * this.popupController.MODE.NEW_BLOCK, or this.popupController.MODE.NEW_CONFIG.
   *
   * @param {string} popupMode Type of popup to be shown.
   */
  createPopup(popupMode) {
    // Exit last popup if exists.
    if (this.popupController) {
      this.popupController.exit();
    }
    // Create popup.
    if (popupMode === PopupController.NEW_BLOCK) {
      if (this.project.librarySet.isEmpty()) {
        this.popupController = new NewLibraryPopupController(this, true);
      } else {
        this.popupController = new NewBlockPopupController(this);
      }
    } else if (popupMode === PopupController.PREVIEW) {
      // TODO: Preview popup view
    } else if (popupMode == PopupController.NEW_CONFIG) {
      // TODO: New config popup view
    } else if (popupMode === PopupController.NEW_PROJECT) {
      this.popupController = new NewProjectPopupController(this);
    } else if (popupMode === PopupController.NEW_LIBRARY) {
      this.popupController = new NewLibraryPopupController(this);
    } else {
      throw new Error('Popup type ' + popupMode + ' not found.');
      return;
    }
    this.popupController.show();
  }

  /**
   * Handler for the window's 'beforeunload' event. When a user has unsaved
   * changes and refreshes or leaves the page, confirm that they want to do so
   * before actually refreshing.
   * @param {Event} event The beforeunload event.
   */
  confirmLeavePage(event) {
    // TODO: Move in from app_controller.js
    console.warn('Unimplemented: confirmLeavePage()');
  }

  /**
   * Top-level function for block creation. Updates views, editors, and model.
   */
  createBlockDefinition() {
    this.view.closeModal_();
    this.createPopup(PopupController.NEW_BLOCK);
  }

  /**
   * Top-level function for library creation. Updates views, editors, and model.
   */
  createLibrary() {
    this.view.closeModal_();
    this.createPopup(PopupController.NEW_LIBRARY);
  }

  /**
   * Top-level function for toolbox creation. Updates views, editors, and model.
   */
  createToolbox() {
    let name = this.getResourceName_(PREFIXES.TOOLBOX);
    if (name) {
      const toolbox = this.projectController.createToolbox(name);
      this.switchEnvironment(AppController.TOOLBOX_EDITOR, toolbox);
    }
  }

  /**
   * Top-level function for workspace contents creation. Updates views, editors,
   * and model.
   */
  createWorkspaceContents() {
    let name = this.getResourceName_(PREFIXES.WORKSPACE_CONTENTS, 'Workspace');
    if (name) {
      const workspaceContents =
          this.projectController.createWorkspaceContents(name);
      this.switchEnvironment(AppController.WORKSPACE_EDITOR, workspaceContents);
    }
  }

  /**
   * Top-level function for workspace configuration creation. Updates views,
   * editors, and model.
   */
  createWorkspaceConfiguration() {
    let name = this.getResourceName_(PREFIXES.WORKSPACE_CONFIG);
    if (name) {
      const workspaceConfig = this.projectController.createWorkspaceConfiguration(name);
      this.switchEnvironment(AppController.WORKSPACE_EDITOR, workspaceConfig);
    }
  }

  /**
   * Gets resource name by prompting user and handling errors if name is invalid.
   * Prompts user again if a resource already exists under that name, and cancels
   * out of prompt if user inputs whitespace. Returns null if user cancels out
   * of naming the resource.
   * @param {string} resourceType Type of resource that is being named.
   * @param {string=} opt_resourceNameForUser Name of resource to display to the
   *     user (if there is a difference between the name for developers and the
   *     name known to users).
   * @return {string} Name of resource given by user, or null if not named.
   * @private
   */
  getResourceName_(resourceType, opt_resourceNameForUser) {
    let errorText = '';
    let name, isDuplicate, isEmpty;
    opt_resourceNameForUser = opt_resourceNameForUser || resourceType;
    do {
      // Prompts and gets name of new resource.
      name = this.promptForResource_(opt_resourceNameForUser, errorText);
      // Checks if new resource name already exists.
      if (resourceType == PREFIXES.TOOLBOX) {
        isDuplicate = this.project.getToolbox(name);
      } else if (resourceType == PREFIXES.WORKSPACE_CONTENTS) {
        isDuplicate = this.project.getWorkspaceContents(name);
      } else if (resourceType == PREFIXES.WORKSPACE_CONFIG) {
        isDuplicate = this.project.getWorkspaceConfiguration(name);
      } else {
        throw 'Unknown resource type, ' + resourceType + '.';
      }
      // Checks if name is not just whitespace.
      isEmpty = name && name.trim() ? false : true;
      // Handles errors.
      if (isDuplicate) {
        errorText = 'This toolbox already exists.\n';
      } else if (isEmpty) {
        return null;
      }
    } while (isDuplicate);
    return name;
  }

  /**
   * Prompts user for new resource name.
   * @param {string} resourceType Type of resource that is being named.
   * @param {string=} opt_errorText Error text to add to prompt message to provide
   *     user with context.
   * @return {string} User's prompt input.
   * @private
   */
  promptForResource_(resourceType, opt_errorText) {
    opt_errorText = opt_errorText || '';
    return window.prompt(opt_errorText + 'Enter your new ' + resourceType +
        ' name.', 'My' + resourceType);
  }

  /**
   * Switches view and editor, closes any open modal elements.
   * @param {string} editor The editor to switch to.
   * @param {!Resource} resource The resource to display upon switching the view.
   * @throws When the given resource is null or undefined, there is no resource
   *     to display.
   */
  switchEnvironment(editor, resource) {
    if (!resource) {
      throw 'switchEnvironment() trying to load a ' + resource + ' object into' +
          ' an editor (' + editor + ').';
    }
    var view = 'EditorView';
    var controller = 'Controller';

    if (editor == AppController.BLOCK_EDITOR) {
      view = PREFIXES.VARIABLE_BLOCK + view;
      controller = PREFIXES.VARIABLE_BLOCK + controller;
    } else if (editor == AppController.TOOLBOX_EDITOR) {
      view = PREFIXES.VARIABLE_TOOLBOX + view;
      controller = PREFIXES.VARIABLE_TOOLBOX + controller;
      resource = this.project.getToolbox(resource.name);
    } else if (editor == AppController.WORKSPACE_EDITOR) {
      view = 'workspace' + view;
      controller = 'workspace' + controller;
    }

    // Switch view.
    this.view.switchView(this.view[view], resource);

    // Switch editor.
    this.editorController.switchEditor(this.editorController[controller]);

    // Close flyout if open.
    this.view.closeModal_();
  }
}
