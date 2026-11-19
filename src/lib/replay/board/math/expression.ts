/**
 * Formulas typed on the board (`a*(x-h)^2+k`, `sin(2x)`, `v*cos(t)`), turned
 * into functions without `eval` (the site's script policy forbids it).
 *
 * A closed grammar: numbers, the independent variable, single-letter
 * parameters, `+ - * / ^`, parentheses and a fixed list of functions. Typing
 * is forgiving the way a teacher writes: `2x` is `2*x`, `a(x-h)` is a times
 * the bracket, `ax` is `a*x`, `sin x` is `sin(x)`, and `π` is `pi`.
 *
 * `compile` never throws: a formula that cannot be read comes back as an
 * error with its position, so the inspector can say what is wrong while the
 * rest of the board keeps working. Length and size are bounded, because every
 * client evaluates what another client sent.
 */

export const MAX_EXPRESSION_LENGTH = 200;
const MAX_NODES = 120;
const MAX_DEPTH = 24;

type ExpressionError =
	'empty' | 'too_long' | 'too_complex' | 'unexpected' | 'unclosed' | 'unknown_name';

/** What a formula is evaluated with: the independent variable and the parameters. */
type Vars = Readonly<Record<string, number>>;

export type Expression =
	| {
			ok: true;
			/** Parameters the formula uses, in order of appearance. */
			params: string[];
			eval: (v: number, params: Vars) => number;
	  }
	| { ok: false; error: ExpressionError; at: number };

type CompileOptions = {
	/** The independent variable: `x` for y = f(x), `t` for a parametric curve. */
	variable: 'x' | 't';
	/** Trigonometric functions take and return degrees. */
	degrees?: boolean;
};

type Fn = (...a: number[]) => number;
type Node = (v: number, p: Vars) => number;

const rad = (d: boolean, f: (x: number) => number): Fn =>
	d ? (x) => f((x * Math.PI) / 180) : (x) => f(x);
const arc = (d: boolean, f: (x: number) => number): Fn =>
	d ? (x) => (f(x) * 180) / Math.PI : (x) => f(x);

/** Functions by name; `degrees` decides how the trigonometric ones read angles. */
function functions(d: boolean): Record<string, { arity: number; fn: Fn }> {
	const one = (fn: Fn) => ({ arity: 1, fn });
	const table: Record<string, { arity: number; fn: Fn }> = {
		sin: one(rad(d, Math.sin)),
		cos: one(rad(d, Math.cos)),
		tan: one(rad(d, Math.tan)),
		cot: one(rad(d, (x) => 1 / Math.tan(x))),
		sec: one(rad(d, (x) => 1 / Math.cos(x))),
		csc: one(rad(d, (x) => 1 / Math.sin(x))),
		asin: one(arc(d, Math.asin)),
		acos: one(arc(d, Math.acos)),
		atan: one(arc(d, Math.atan)),
		sinh: one(Math.sinh),
		cosh: one(Math.cosh),
		tanh: one(Math.tanh),
		sqrt: one(Math.sqrt),
		cbrt: one(Math.cbrt),
		abs: one(Math.abs),
		exp: one(Math.exp),
		ln: one(Math.log),
		log: one(Math.log10),
		log2: one(Math.log2),
		floor: one(Math.floor),
		ceil: one(Math.ceil),
		round: one(Math.round),
		sign: one(Math.sign),
		min: { arity: 2, fn: Math.min },
		max: { arity: 2, fn: Math.max },
		atan2: {
			arity: 2,
			fn: (y, x) => (d ? (Math.atan2(y, x) * 180) / Math.PI : Math.atan2(y, x))
		}
	};
	// Names people also write.
	table.arcsin = table.asin;
	table.arccos = table.acos;
	table.arctan = table.atan;
	table.tg = table.tan;
	table.cotg = table.cot;
	table.lg = table.log;
	return table;
}

/** A parameter is one letter, Latin or Greek (physics: ω, θ, φ, λ). */
const LETTER = /^[A-Za-zα-ωΑ-Ω]$/u;
const DIGIT = /[0-9]/;

type Token =
	| { kind: 'num'; value: number; at: number }
	| { kind: 'name'; text: string; at: number }
	| { kind: 'op'; text: string; at: number }
	| { kind: 'end'; at: number };

class Failure {
	constructor(
		readonly error: ExpressionError,
		readonly at: number
	) {}
}

function tokenize(src: string): Token[] {
	const out: Token[] = [];
	let i = 0;
	while (i < src.length) {
		const ch = src[i];
		if (ch === ' ' || ch === '\t') {
			i++;
		} else if (DIGIT.test(ch) || (ch === '.' && DIGIT.test(src[i + 1] ?? ''))) {
			let end = i;
			while (end < src.length && (DIGIT.test(src[end]) || src[end] === '.')) end++;
			const text = src.slice(i, end);
			const value = Number(text);
			if (!Number.isFinite(value)) throw new Failure('unexpected', i);
			out.push({ kind: 'num', value, at: i });
			i = end;
		} else if ('+-*/^()×·÷−,'.includes(ch)) {
			const text = ch === '×' || ch === '·' ? '*' : ch === '÷' ? '/' : ch === '−' ? '-' : ch;
			out.push({ kind: 'op', text, at: i });
			i++;
		} else if (LETTER.test(ch) || ch === 'π') {
			let end = i;
			while (end < src.length && (LETTER.test(src[end]) || src[end] === 'π')) end++;
			out.push({ kind: 'name', text: src.slice(i, end), at: i });
			i = end;
		} else {
			throw new Failure('unexpected', i);
		}
	}
	out.push({ kind: 'end', at: src.length });
	return out;
}

class Parser {
	#i = 0;
	#nodes = 0;
	#depth = 0;
	readonly params: string[] = [];

	constructor(
		private readonly tokens: Token[],
		private readonly variable: string,
		private readonly fns: Record<string, { arity: number; fn: Fn }>
	) {}

	parse(): Node {
		const node = this.#sum();
		const t = this.#peek();
		if (t.kind !== 'end')
			throw new Failure(t.kind === 'op' && t.text === ')' ? 'unclosed' : 'unexpected', t.at);
		return node;
	}

	#peek(): Token {
		return this.tokens[this.#i];
	}

	#isOp(text: string): boolean {
		const t = this.#peek();
		return t.kind === 'op' && t.text === text;
	}

	#node(n: Node): Node {
		if (++this.#nodes > MAX_NODES) throw new Failure('too_complex', this.#peek().at);
		return n;
	}

	#sum(): Node {
		let left = this.#product();
		for (;;) {
			const plus = this.#isOp('+');
			if (!plus && !this.#isOp('-')) return left;
			this.#i++;
			const a = left;
			const b = this.#product();
			left = this.#node(plus ? (v, p) => a(v, p) + b(v, p) : (v, p) => a(v, p) - b(v, p));
		}
	}

	#product(): Node {
		let left = this.#unary();
		for (;;) {
			const times = this.#isOp('*');
			if (times || this.#isOp('/')) {
				this.#i++;
				const a = left;
				const b = this.#unary();
				left = this.#node(
					times ? (v, p) => a(v, p) * b(v, p) : (v, p) => a(v, p) / b(v, p)
				);
			} else if (this.#startsFactor()) {
				// Implicit multiplication: 2x, 2(x+1), (x+1)(x-1), a sin x.
				const a = left;
				const b = this.#unary();
				left = this.#node((v, p) => a(v, p) * b(v, p));
			} else {
				return left;
			}
		}
	}

	#startsFactor(): boolean {
		const t = this.#peek();
		return t.kind === 'num' || t.kind === 'name' || (t.kind === 'op' && t.text === '(');
	}

	#unary(): Node {
		if (this.#isOp('-')) {
			this.#i++;
			const a = this.#unary();
			return this.#node((v, p) => -a(v, p));
		}
		if (this.#isOp('+')) {
			this.#i++;
			return this.#unary();
		}
		return this.#power();
	}

	// Right associative; the exponent may carry a sign (2^-x).
	#power(): Node {
		const base = this.#atom();
		if (!this.#isOp('^')) return base;
		this.#i++;
		const exponent = this.#unary();
		return this.#node((v, p) => Math.pow(base(v, p), exponent(v, p)));
	}

	#atom(): Node {
		if (++this.#depth > MAX_DEPTH) throw new Failure('too_complex', this.#peek().at);
		try {
			return this.#primary();
		} finally {
			this.#depth--;
		}
	}

	#primary(): Node {
		const t = this.#peek();
		if (t.kind === 'num') {
			this.#i++;
			const value = t.value;
			return this.#node(() => value);
		}
		if (t.kind === 'op' && t.text === '(') {
			this.#i++;
			const inner = this.#sum();
			this.#close();
			return inner;
		}
		if (t.kind === 'name') return this.#name(t);
		throw new Failure(t.kind === 'end' ? 'unclosed' : 'unexpected', t.at);
	}

	#close() {
		const t = this.#peek();
		if (t.kind !== 'op' || t.text !== ')') throw new Failure('unclosed', t.at);
		this.#i++;
	}

	/**
	 * A run of letters: a function or constant when it starts with a known
	 * name (longest first), otherwise one letter, so `ax` reads as a*x and
	 * `xy`, `kx` need no spaces.
	 */
	#name(t: Extract<Token, { kind: 'name' }>): Node {
		const text = t.text;
		let fnName = '';
		for (const name of Object.keys(this.fns)) {
			if (text.startsWith(name) && name.length > fnName.length) fnName = name;
		}
		if (fnName) {
			const rest = text.slice(fnName.length);
			// Split the token: what follows the function name is read again.
			this.tokens.splice(
				this.#i,
				1,
				...(rest ? [{ ...t, text: rest, at: t.at + fnName.length }] : [])
			);
			return this.#call(fnName, t.at);
		}
		for (const name of ['pi', 'π']) {
			if (text.startsWith(name)) return this.#rest(t, name.length, () => Math.PI);
		}
		const first = [...text][0];
		const width = first.length;
		if (first === this.variable) {
			return this.#rest(t, width, (v) => v);
		}
		if (first === 'e') return this.#rest(t, width, () => Math.E);
		if (!LETTER.test(first)) throw new Failure('unknown_name', t.at);
		if (!this.params.includes(first)) this.params.push(first);
		return this.#rest(t, width, (_, p) => p[first] ?? 1);
	}

	/** Consumes `width` characters of a name token; the remainder stays a token. */
	#rest(t: Extract<Token, { kind: 'name' }>, width: number, fn: Node): Node {
		const rest = t.text.slice(width);
		this.tokens.splice(this.#i, 1, ...(rest ? [{ ...t, text: rest, at: t.at + width }] : []));
		return this.#node(fn);
	}

	#call(name: string, at: number): Node {
		const { arity, fn } = this.fns[name];
		const args: Node[] = [];
		if (this.#isOp('(')) {
			this.#i++;
			args.push(this.#sum());
			while (this.#isOp(',')) {
				this.#i++;
				args.push(this.#sum());
			}
			this.#close();
		} else {
			// sin x, sin 2x… without brackets takes the next power: sin x^2 is sin(x²).
			args.push(this.#power());
		}
		if (args.length !== arity) throw new Failure('unexpected', at);
		if (arity === 1) {
			const [a] = args;
			return this.#node((v, p) => fn(a(v, p)));
		}
		const [a, b] = args;
		return this.#node((v, p) => fn(a(v, p), b(v, p)));
	}
}

const cache = new Map<string, Expression>();

export function compile(source: string, options: CompileOptions): Expression {
	const key = `${options.variable}${options.degrees ? 'd' : 'r'}|${source}`;
	let result = cache.get(key);
	if (!result) {
		result = build(source, options);
		if (cache.size >= 500) cache.clear();
		cache.set(key, result);
	}
	return result;
}

function build(source: string, options: CompileOptions): Expression {
	const src = source.trim();
	if (!src) return { ok: false, error: 'empty', at: 0 };
	if (src.length > MAX_EXPRESSION_LENGTH)
		return { ok: false, error: 'too_long', at: MAX_EXPRESSION_LENGTH };
	try {
		const parser = new Parser(
			tokenize(src),
			options.variable,
			functions(options.degrees === true)
		);
		const node = parser.parse();
		return { ok: true, params: parser.params, eval: node };
	} catch (err) {
		if (err instanceof Failure) return { ok: false, error: err.error, at: err.at };
		// Anything else (a stack limit on a hostile input) is still just "cannot read".
		return { ok: false, error: 'too_complex', at: 0 };
	}
}

/** The names a number can be typed as in the inspector: `2pi`, `-1/2`, `0.5`. */
export function parseNumber(text: string): number | null {
	const e = compile(text, { variable: 'x' });
	if (!e.ok || e.params.length > 0) return null;
	const value = e.eval(0, {});
	// A formula in x is not a number.
	if (!Number.isFinite(value) || e.eval(1, {}) !== value) return null;
	return value;
}
