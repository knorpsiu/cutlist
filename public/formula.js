// Tiny arithmetic evaluator for numeric fields: + - * / and parentheses, e.g. "=2400-60-60".
// The leading "=" is optional. Parsed by hand (no eval). Throws an Error with a short message.
(function (global) {
  function evaluate(text) {
    const src = String(text).trim().replace(/^=/, '');
    const tokens = src.match(/\d+(?:\.\d*)?|\.\d+|[-+*/()]|\S/g) || [];
    let i = 0;
    const peek = () => tokens[i];
    const next = () => tokens[i++];

    function expr() {
      let value = term();
      while (peek() === '+' || peek() === '-') value = next() === '+' ? value + term() : value - term();
      return value;
    }
    function term() {
      let value = factor();
      while (peek() === '*' || peek() === '/') value = next() === '*' ? value * factor() : value / factor();
      return value;
    }
    function factor() {
      const t = next();
      if (t === '-') return -factor();
      if (t === '+') return factor();
      if (t === '(') {
        const value = expr();
        if (next() !== ')') throw new Error('Missing )');
        return value;
      }
      if (t !== undefined && /^[\d.]/.test(t)) return parseFloat(t);
      throw new Error(t === undefined ? 'Incomplete formula' : `Unexpected "${t}"`);
    }

    if (!tokens.length) throw new Error('Empty formula');
    const value = expr();
    if (i < tokens.length) throw new Error(`Unexpected "${tokens[i]}"`);
    if (!Number.isFinite(value)) throw new Error('Division by zero');
    return +value.toFixed(6); // drop floating-point noise like 0.1+0.2
  }

  // Number from a field value: plain numbers or formulas; NaN when empty or invalid.
  function toNumber(text) {
    try {
      return String(text).trim() === '' ? NaN : evaluate(text);
    } catch {
      return NaN;
    }
  }

  global.Formula = { evaluate, toNumber };
  if (typeof module !== 'undefined') module.exports = { evaluate, toNumber };
})(typeof window !== 'undefined' ? window : globalThis);
