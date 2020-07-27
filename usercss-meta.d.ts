// Type definitions for usercss-meta 0.9.0
// Project: stylusless

declare module "usercss-meta" {
	export interface Metadata extends Record<string, any> {
		name?: string
		version?: string
		namespace?: string
		author?: string
		description?: string
		homepageURL?: string
		supportURL?: string
		updateURL?: string
		license?: string
		preprocessor?: string
		vars?: Record<string, Variable>
		[key: string]: any
	}

	export interface Variable {
		type: string
		label: string
		name: string
		value: string | null
		default: string
		options: SelectVariableOption[] | null
		min?: number | null
		max?: number | null
		units?: string | null
	}

	export type VariableType =
		| "text"
		| "color"
		| "checkbox"
		| "select"
		| "dropdown"
		| "image"
		| "number"
		| "range"
		| string // TODO

	export interface SelectVariableOption {
		name: string
		label: string
		value: string
	}

	export class Parser {
		/**
		 * Parse the text (metadata header) and return the result.
		 *
		 * @param text
		 */
		parse(text: string): ParseResult
		validateVar(variable: Variable): void
	}

	/**
	 * Create a metadata parser.
	 *
	 * @param options
	 */
	export function createParser(options: ParserOptions): Parser

	/**
	 * Parse metadata and return an object.
	 *
	 * This is a shortcut of `createParser(options).parse(text);`
	 *
	 * @param text
	 * @param options
	 */
	export function parse(text: string, options?: ParserOptions): ParseResult

	export interface ParseResult {
		errors: Error[]
		metadata: Metadata
	}

	export interface ParserOptions {
		/**
		 * Decides how to parse unknown keys. Possible values are:
		 * - `"ignore"`: The directive is ignored.
		 * - `"assign"`: Assign the text value (characters before `\s*\n`) to result object.
		 * - `"throw"`: Throw a `ParseError`
		 *
		 * @defaultValue `"ignore"`
		 */
		unknownKey?: "ignore" | "assign" | "throw"
		/**
		 * Marks multiple keys as mandatory. If some keys are missing then throw a `ParseError`.
		 *
		 * @defaultValue `['name', 'namespace', 'version']`
		 */
		mandatoryKeys?: string[]
		/**
		 * A `key: parseFunction` map. It allows users to extend the parser.
		 *
		 * @example https://github.com/openstyles/usercss-meta#createparser
		 */
		parseKey?: Record<string, (state: ParserState) => any>
		/**
		 * A `variableType: parseFunction` map. It allows users to extend the parser.
		 *
		 * @example https://github.com/openstyles/usercss-meta#createparser
		 */
		parseVar?: Record<VariableType, (state: ParserState) => any>
		/**
		 * A `key: validateFunction` map, which is used to validate the metadata value.
		 *
		 * There are some builtin validators, which can be overwritten:
		 * - `version`: Ensure the value matches [semver-regex](https://github.com/sindresorhus/semver-regex) then strip the leading `v` or `=`.
		 * - `homepageURL`: Ensure it is a valid URL and the protocol must be `http` or `https`.
		 * - `updateURL`: Same as `homepageURL`.
		 * - `supportURL`: Same as `homepageURL`.
		 *
		 * @example https://github.com/openstyles/usercss-meta#createparser
		 */
		validateKey?: Record<string, (state: ParserState) => void>
		/**
		 * A `variableType: validateFunction` map, which is used to validate variables.
		 *
		 * Builtin validators:
		 * - `checkbox`: Ensure the value is 0 or 1.
		 * - `number`: Ensure sure the value is a number, doesn't exceed the minimum/maximum, and is a multiple of the step value.
		 * - `range`: Same as `number`.
		 */
		validateVar?: Record<VariableType, (state: ParserState) => void>
		/**
		 * If true, the parser will collect parsing errors and return them as `parseResult.errors`.
		 * Otherwise, the first parsing error will be thrown.
		 */
		allowErrors?: boolean
	}

	// TODO: Document
	export interface ParserState {
		value: string
		valueIndex: number
	}

	export class Stringifier {
		stringify(metadata: Metadata): string
	}

	/**
	 * Create a metadata stringifier.
	 *
	 * @param options
	 */
	export function createStringifier(options: StringifierOptions): Stringifier

	/**
	 * This is a shortcut of: `createStringifier(options).stringify(metadata);`
	 *
	 * @param metadata
	 * @param options
	 */
	export function stringify(
		metadata: Metadata,
		options: StringifierOptions,
	): string

	/**
	 * This changes how variables are stringified (`@var` v.s. `@advanced`)
	 */
	export type Format = "stylus" | "xstyle"

	export interface StringifierOptions {
		/**
		 * Decide whether to align metadata keys.
		 * @defaultValue false
		 */
		alignKeys?: boolean
		/**
		 * Same as the space parameter for JSON.stringify.
		 * @defaultValue 2
		 */
		space?: string | number
		/**
		 * Possible values are 'stylus' and 'xstyle'.
		 * This changes how variables are stringified (@var v.s. @advanced).
		 * @defaultValue 'stylus'
		 */
		format?: Format
		/**
		 * Extend the stringifier to handle specified keys.
		 * The object is a map of `key: stringifyFunction` pair.
		 *
		 * `stringifyFunction` would receive one argument:
		 * - `value`: The value of the key, which is the same as `metadataObject[key]`.
		 *
		 * The function should return a string or an array of strings.
		 */
		stringifyKey?: Record<string, (value: any) => string | string[]>
		/**
		 * Extend the stringifier to handle custom variable type.
		 *
		 * The object is a map of `varType: stringifyFunction` pair. The function would receive three arguments
		 * - `variable`: The variable which should be stringified, which is the same as `metadataObject.vars[variable.name]`.
		 * - `format`: The format parameter of the option.
		 * - `space`: The space parameter of the option.

		 * The function should return a string which represents the _default value_ of the variable.
		 */
		stringifyVar?: Record<
			VariableType,
			(variable: Variable, format: Format, space: string | number) => string
		>
	}

	export class ParseError extends Error {}

	/**
	 * A collection of parser utilities. Some of them might be useful when extending the parser.
	 */
	export namespace util {
		/**
		 * Move `state.lastIndex` to next line.
		 */
		export function eatLine(state: ParserState): void
		/**
		 * Move `state.lastIndex` to next non-whitespace character.
		 */
		export function eatWhitespace(state: ParserState): void
		/**
		 * Parse character.
		 */
		export function parseChar(state: ParserState): void
		/**
		 * Parse EOT multiline string used by xStyle extension.
		 */
		export function parseEOT(state: ParserState): void
		/**
		 * Parse JSON value. Note that the JSON parser can parse some additional syntax like single quoted string, backtick quoted multiline string, etc.
		 */
		export function parseJSON(state: ParserState): void
		/**
		 * Parse numbers.
		 */
		export function parseNumber(state: ParserState): void
		/**
		 * Parse quoted string.
		 */
		export function parseString(state: ParserState): void
		/**
		 * Parse the text value before line feed.
		 */
		export function parseStringToEnd(state: ParserState): void
		/**
		 * Parse unquoted string.
		 */
		export function parseStringUnquoted(state: ParserState): void
		/**
		 * Parse a word. ([\w-]+)
		 */
		export function parseWord(state: ParserState): void
		/**
		 * Unquote and unescape quoted string.
		 */
		export function unquote(s: string): string
	}
}
