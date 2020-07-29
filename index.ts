/// <reference path="./usercss-meta.d.ts" />
import * as fs from "fs"
import * as path from "path"
import { URL } from "url"
import fetch from "node-fetch"
import { promisify } from "util"
import { parse, Metadata, Variable } from "usercss-meta"
import * as csstree from "css-tree"
import * as yargs from "yargs"

const replaceAll = (str: string, find: string, replace: string) =>
	str.replace(
		new RegExp(find.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "g"),
		replace,
	)

const colorHexToRGB = (hexColor: string) => {
	const value = parseInt(hexColor.substr(1))
	const r = (value >> 16) & 0xff
	const g = (value >> 8) & 0xff
	const b = value & 0xff
	return `${r}, ${g}, ${b}`
}

const valueForVariable = (variable: Variable): string => {
	// TODO: Don't always use the default value
	switch (variable.type) {
		case "select":
		case "dropdown":
		case "image":
			return variable.options.find((option) => option.name === variable.default)
				.value
		case "number":
		case "range":
			return `${variable.default}${variable.units ?? ""}`
		default:
			return variable.default
	}
}

const assignVariables = (
	styleText: string,
	{ preprocessor, vars }: Metadata,
): string => {
	// Replace variable placeholders with sensible values.
	switch (preprocessor) {
		case "default":
		case undefined:
			// TODO?
			return styleText
		case "uso":
			// TODO: Use CSS variables instead of direct substitution.
			return Object.keys(vars).reduce((style, name) => {
				let newStyle = replaceAll(
					style,
					`/*[[${name}]]*/`,
					valueForVariable(vars[name]),
				)
				if (vars[name].type === "color") {
					newStyle = replaceAll(
						newStyle,
						`/*[[${name}-rgb]]*/`,
						colorHexToRGB(valueForVariable(vars[name])),
					)
				}
				return newStyle
			}, styleText)
		default:
			throw new Error("preprocessor not implemented")
	}
}

/**
 * Fixes special character escaping for regexp() arguments in CSS.
 *
 * For example, some userstyles write "\w" when "\\w" is required.
 * One escape is necessary for the regexp, another for the CSS string.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/CSS/@document#Syntax
 *
 * @param regexp regexp argument to fix
 */
const escapeCSSRegExp = (regexp: string): string => {
	if (regexp.includes(String.raw`\\`)) {
		// Assume already properly escaped if the regexp contains \\
		return regexp
	}

	// Replace single-backslash escapes with double-backslashes.
	return regexp.replace(/([^\\]\\)/g, "$1\\")
}

/**
 * Validates CSS and applies transformations necessary for userContent.css.
 *
 * @param css css to validate and transform
 */
const validateAndTransformCSS = (
	css: string,
): { errors: string[]; warnings: string[]; transformed: string } => {
	const errors = []
	const ast = csstree.parse(css, {
		positions: true,
		onParseError: (error) => errors.push(error),
	})

	const stringifyError = (e) =>
		`${e.line}:${e.column} (${e.property}): ${e.message}\n${e.error}`

	// https://github.com/csstree/validator/blob/73c7a745a860bb9fb88cb463f0/LICENSE
	csstree.walk(ast, {
		visit: "Declaration",
		enter: function (node) {
			const match = (csstree as any).lexer.matchDeclaration(node)
			const error = match.error
			if (!error) return

			let message = error.rawMessage || error.message || error

			// ignore errors except those which make sense
			if (
				error.name !== "SyntaxMatchError" &&
				error.name !== "SyntaxReferenceError"
			) {
				return
			}

			if (message === "Mismatch") {
				message = "Invalid value for `" + node.property + "`"
			}

			const errorReport = {
				name: error.name,
				node: node,
				loc: error.loc || node.loc,
				line: error.line || (node.loc && node.loc.start && node.loc.start.line),
				column:
					error.column || (node.loc && node.loc.start && node.loc.start.column),
				property: node.property,
				message: message,
				error: error,
			}

			errors.push(stringifyError(errorReport))
		},
	})

	if (errors.length) {
		return { errors, warnings: [], transformed: css }
	}

	// Mark all declarations as !important.
	// This is necessary because userstyles are written for
	// injection at a higher precedence than page styles.
	csstree.walk(ast, {
		visit: "Declaration",
		enter: (node) => {
			node.important = true
		},
	})

	const warnings = []

	// Fix escaping inside regexp() blocks.
	// See documentation for `escapeCSSRegExp`.
	// TODO: Why do these buggy styles work in Stylus?
	csstree.walk(ast, {
		visit: "AtrulePrelude",
		enter: function (node) {
			if (
				this.atrule.name !== "-moz-document" &&
				this.atrule.name !== "document"
			)
				return

			node.children.forEach((preludeFunction) => {
				if (
					preludeFunction.type !== "Function" ||
					preludeFunction.name !== "regexp"
				)
					return

				const regexp = preludeFunction.children.first()
				const loc = `${regexp.loc.start.line}:${regexp.loc.start.column}`
				if (regexp.type !== "String") {
					errors.push(`${loc}: regexp() argument must be a String`)
					return
				}

				const escaped = escapeCSSRegExp(regexp.value)
				if (regexp.value !== escaped) {
					warnings.push(`${loc}: Fixed escaping in regexp(${regexp.value})`)
				}
				regexp.value = escaped
			})
		},
	})

	return { errors, warnings, transformed: csstree.generate(ast) }
}

const fetchStyle = async (urlString: string): Promise<string> => {
	const url = new URL(urlString)
	switch (url.protocol) {
		case "file:":
			return await promisify(fs.readFile)(url, { encoding: "utf-8" })
		default:
			return await (await fetch(urlString)).text()
	}
}

const main = async () => {
	// TODO: Allow user to specify a Firefox profile and take care of it from there?
	const argv = yargs
		.usage(
			"Usage: $0 --user-styles <path> --output-styles-dir <path> --output-imports-file <path>",
		)
		.option("user-styles", {
			type: "string",
			description: "Input path to newline-separated list of user styles to use",
			required: true,
		})
		.option("output-styles-dir", {
			type: "string",
			description: "Output path to directory where styles will be stored",
			required: true,
		})
		.option("output-imports-file", {
			type: "string",
			description:
				"Output path where imports suitable for userContent.css will be written",
			required: true,
		})
		.option("ignore-lint", {
			type: "boolean",
			description: "Whether to continue even if generated styles fail to lint",
			required: false,
			default: false,
		}).argv

	const styleUrls = (
		await promisify(fs.readFile)(argv["user-styles"], {
			encoding: "utf-8",
		})
	)
		.split("\n")
		.filter((url) => url.trim().length > 0)

	const stylePaths = await Promise.all(
		styleUrls.map(async (styleUrl) => {
			// TODO: Keep track of currently installed version?
			// Fetch the raw userstyle from its URL.
			const rawStyle = await fetchStyle(styleUrl)
			const filename = path.basename(new URL(styleUrl).pathname)

			// Parse the userstyle metadata block from the style file.
			const { metadata, errors } = parse(rawStyle, { mandatoryKeys: [] })
			if (errors.length) {
				throw new Error(errors.join("\n"))
			}

			// Perform preprocessing on the userstyle to transform it into valid CSS.
			const css = assignVariables(rawStyle, metadata)

			// Validate the generated CSS file and apply fixes for userContent.css.
			const {
				transformed,
				warnings: validationWarnings,
				errors: validationErrors,
			} = validateAndTransformCSS(css)

			// Throw an error if any parsing / validation errors occurred.
			if (validationErrors.length) {
				throw new Error(
					`CSS Validation Errors: ${filename}\n${validationErrors.join("\n")}`,
				)
			}

			// Inform the user of any validation warnings that occurred.
			if (validationWarnings.length) {
				const msg = validationWarnings.join("\n")
				console.log(`CSS Validation Warnings: ${filename}\n${msg}\n`)
			}

			// Write the generated CSS file to `output-styles-dir`.
			const stylePath = path.join(argv["output-styles-dir"], filename)

			await promisify(fs.mkdir)(argv["output-styles-dir"], { recursive: true })
			await promisify(fs.writeFile)(stylePath, transformed)

			return stylePath
		}),
	)

	const importStylesString = stylePaths
		.map((stylePath) => {
			const relative = path.relative(
				path.dirname(argv["output-imports-file"]),
				stylePath,
			)
			return `@import url("${relative}");` // TODO: Escape?
		})
		.join("\n")

	await promisify(fs.writeFile)(
		argv["output-imports-file"],
		importStylesString + "\n",
	)
}

main().catch((error) => console.error(error))
