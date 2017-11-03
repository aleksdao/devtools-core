/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { replaceOriginalVariableName } = require("../utils");
const { getLocationScopes } = require("../scopes");

const { getSource, getSourceMap, parseScopes } = require("./helpers");

describe("replaceOriginalVariableName", () => {
  it("replaces variable in provided expressions", () => {
    const source = getSource("sum.min");
    const location = {
      sourceId: source.id,
      line: 1,
      column: 27
    };
    const scopes = parseScopes(location, source);

    const map = getSourceMap(source);
    const mappedScopes = getLocationScopes(map, scopes, location);

    const testAssertions = [
      ["first", "n"],
      ["first.toString()", "n.toString()"],
      ["first*2", "n*2"],
      ["first*second", "n*u"],
      ["first[second]", "n[u]"],
      ["window.first", "window.first"],
      ["second.replace(';','')", "u.replace(';','')"]
      // ["{ first: second }", "{first:u}"], // currently produces "{first:u;}"
      // ["{ second }", "{second:u}"],
      // ["first;", "first;"],
      // ["()[]", "())[]"]
    ];

    testAssertions.forEach(inputAndExpectedValue => {
      const [input, expectedValue] = inputAndExpectedValue;
      const expr = replaceOriginalVariableName(input, mappedScopes);
      expect(expr).toEqual(expectedValue);
    });
  });
});
