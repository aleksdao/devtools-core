/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 /* global jest */
const { shallow } = require("enzyme");

const {
  REPS,
  getRep,
} = require("../rep");

const { GripMapEntry } = REPS;
const { createGripMapEntry } = GripMapEntry;
const { MODE } = require("../constants");

const stubs = require("../stubs/grip-map-entry");
const nodeStubs = require("../stubs/element-node");
const gripArrayStubs = require("../stubs/grip-array");

const renderRep = (object, mode, props) => {
  return shallow(GripMapEntry.rep(Object.assign({
      object,
      mode,
  }, props)));
};

describe("GripMapEntry - simple", () => {
  const stub = stubs.get("A → 0");

  it("Rep correctly selects GripMapEntry Rep", () => {
    expect(getRep(stub)).toBe(GripMapEntry.rep);
  });

  it("GripMapEntry rep has expected text content", () => {
    const renderedComponent = renderRep(stub);
    expect(renderedComponent.text()).toEqual("A → 0");
  });
});

describe("GripMapEntry - createGripMapEntry", () => {
  it("return the expected object", () => {
    const entry = createGripMapEntry("A", 0);
    expect(entry).toEqual(stubs.get("A → 0"));
  });
});

describe("GripMapEntry - complex", () => {
  it("Handles complex objects as key and value", () => {
    let stub = gripArrayStubs.get("testBasic");
    let entry = createGripMapEntry("A", stub);
    expect(renderRep(entry, MODE.TINY).text()).toEqual("A → []");
    expect(renderRep(entry, MODE.SHORT).text()).toEqual("A → Array []");
    expect(renderRep(entry, MODE.LONG).text()).toEqual("A → Array []");

    entry = createGripMapEntry(stub, "A");
    expect(renderRep(entry, MODE.TINY).text()).toEqual(`[] → "A"`);
    expect(renderRep(entry, MODE.SHORT).text()).toEqual(`Array [] → "A"`);
    expect(renderRep(entry, MODE.LONG).text()).toEqual(`Array [] → "A"`);

    stub = gripArrayStubs.get("testMaxProps");
    entry = createGripMapEntry("A", stub);
    expect(renderRep(entry, MODE.TINY).text()).toEqual(`A → […]`);
    expect(renderRep(entry, MODE.SHORT).text()).toEqual(`A → Array [ 1, "foo", {} ]`);
    expect(renderRep(entry, MODE.LONG).text()).toEqual(`A → Array [ 1, "foo", {} ]`);

    entry = createGripMapEntry(stub, "A");
    expect(renderRep(entry, MODE.TINY).text()).toEqual(`[…] → "A"`);
    expect(renderRep(entry, MODE.SHORT).text()).toEqual(`Array [ 1, "foo", {} ] → "A"`);
    expect(renderRep(entry, MODE.LONG).text()).toEqual(`Array [ 1, "foo", {} ] → "A"`);

    stub = gripArrayStubs.get("testMoreThanShortMaxProps");
    entry = createGripMapEntry("A", stub);
    expect(renderRep(entry, MODE.TINY).text()).toEqual(`A → […]`);
    expect(renderRep(entry, MODE.SHORT).text())
      .toEqual(`A → Array [ "test string", "test string", "test string", … ]`);
    expect(renderRep(entry, MODE.LONG).text()).toEqual(
      `A → Array [ "test string", "test string", "test string", "test string" ]`);

    entry = createGripMapEntry(stub, "A");
    expect(renderRep(entry, MODE.TINY).text()).toEqual(`[…] → "A"`);
    expect(renderRep(entry, MODE.SHORT).text())
      .toEqual(`Array [ "test string", "test string", "test string", … ] → "A"`);
    expect(renderRep(entry, MODE.LONG).text()).toEqual(
      `Array [ "test string", "test string", "test string", "test string" ] → "A"`);
  });

  it("Handles Element Nodes as key and value", () => {
    const stub = nodeStubs.get("Node");

    const onInspectIconClick = jest.fn();
    const onDOMNodeMouseOut = jest.fn();
    const onDOMNodeMouseOver = jest.fn();

    let entry = createGripMapEntry("A", stub);
    let renderedComponent = renderRep(entry, MODE.TINY, {
      onInspectIconClick,
      onDOMNodeMouseOut,
      onDOMNodeMouseOver,
    });
    expect(renderRep(entry, MODE.TINY).text())
      .toEqual("A → input#newtab-customize-button.bar.baz");

    let node = renderedComponent.find(".objectBox-node");
    let icon = node.find(".open-inspector");
    icon.simulate("click", { type: "click" });
    expect(icon.exists()).toBeTruthy();
    expect(onInspectIconClick.mock.calls.length).toEqual(1);
    expect(onInspectIconClick.mock.calls[0][0]).toEqual(stub);
    expect(onInspectIconClick.mock.calls[0][1].type).toEqual("click");

    node.simulate("mouseout");
    expect(onDOMNodeMouseOut.mock.calls.length).toEqual(1);

    node.simulate("mouseover");
    expect(onDOMNodeMouseOver.mock.calls.length).toEqual(1);
    expect(onDOMNodeMouseOver.mock.calls[0][0]).toEqual(stub);

    entry = createGripMapEntry(stub, "A");
    renderedComponent = renderRep(entry, MODE.TINY, {
      onInspectIconClick,
      onDOMNodeMouseOut,
      onDOMNodeMouseOver,
    });
    expect(renderRep(entry, MODE.TINY).text())
      .toEqual(`input#newtab-customize-button.bar.baz → "A"`);

    node = renderedComponent.find(".objectBox-node");
    icon = node.find(".open-inspector");
    icon.simulate("click", { type: "click" });
    expect(node.exists()).toBeTruthy();
    expect(onInspectIconClick.mock.calls.length).toEqual(2);
    expect(onInspectIconClick.mock.calls[1][0]).toEqual(stub);
    expect(onInspectIconClick.mock.calls[1][1].type).toEqual("click");

    node.simulate("mouseout");
    expect(onDOMNodeMouseOut.mock.calls.length).toEqual(2);

    node.simulate("mouseover");
    expect(onDOMNodeMouseOver.mock.calls.length).toEqual(2);
    expect(onDOMNodeMouseOver.mock.calls[1][0]).toEqual(stub);
  });
});
