/// <reference path="./usercss-meta.d.ts" />
import * as fs from "fs"
import * as path from "path"
import fetch from "cross-fetch"
import { promisify } from "util"
import { parse, Metadata, Variable } from "usercss-meta"
import { lint } from "stylelint"
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

// TODO: Make this smarter?
const adjustPriority = (styleText: string): string =>
	styleText.replace(/(: ?[^\!]*?);\n/g, "$1 !important;\n")

const validateCSS = async (styleText: string): Promise<void> => {
	const result = await lint({
		code: styleText,
		syntax: "css" as any,
		config: {
			extends: "stylelint-config-recommended",
			rules: {
				"no-duplicate-selectors": null,
				"no-descending-specificity": null,
				"keyframe-declaration-no-important": null,
				"declaration-block-no-shorthand-property-overrides": null,
				"declaration-block-no-duplicate-properties": null,
				"font-family-no-duplicate-names": null,
				"selector-type-no-unknown": null,
			},
		},
	})

	if (result.errored)
		throw new Error(`Interpolated CSS failed to validate:\n${result.output}`)
}

const main = async () => {
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
			const rawStyle = await (await fetch(styleUrl)).text()

			const { metadata, errors } = parse(rawStyle, { mandatoryKeys: [] })
			if (errors.length) {
				throw new Error(errors.join("\n"))
			}

			const style = adjustPriority(assignVariables(rawStyle, metadata))

			const filename = path.basename(new URL(styleUrl).pathname)
			const stylePath = path.join(argv["output-styles-dir"], filename)

			await promisify(fs.mkdir)(argv["output-styles-dir"], { recursive: true })
			await promisify(fs.writeFile)(stylePath, style)

			try {
				await validateCSS(style)
			} catch (error) {
				if (argv["ignore-lint"] !== true) throw error
			}

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
