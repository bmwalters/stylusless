# stylusless

A Userstyle installer for Firefox's `userContent.css`.

## Motivation

[Stylus](https://github.com/openstyles/stylus) is great, but there's a short
[flash of unstyled content](https://github.com/openstyles/stylus/issues/287) on my machine.

Styles customized direclty via Firefox's `userContent.css` don't suffer from this.

This project bridges the Userstyle ecosystem with Firefox's built-in ability to customize site styles.

## Usage

Create a newline-separated list of URLs to fetch userstyles from.

```
https://raw.githubusercontent.com/StylishThemes/Wikipedia-Dark/master/wikipedia-dark.user.css
https://stylishthemes.github.io/GitHub-Dark/github-dark.user.css
```

Next, run the script. Three arguments are required:

- Pass the location of said list as the `--user-styles` parameter.
- Pass a directory to write downloaded userstyles to as the `--output-styles-dir` parameter.
  I use a directory next to my `userContent.css`.
- Pass a location to write a file that `@import`s each userstyle as the `--output-imports-file` parameter.
  I use a `userstyleImports.css` file next to my `userContent.css`.

```shell
npm install && npm run run -- \
  --user-styles ~/.mozilla/firefox/my-profile/chrome/userstyles.txt \
  --output-styles-dir ~/.mozilla/firefox/my-profile/chrome/userstyles-dir \
  --output-imports-file ~/.mozilla/firefox/my-profile/chrome/userstyleImports.css
```

If any lint errors or other errors occur, file a GitHub issue and try again with the `--ignore-lint` parameter.

Lastly, modify your `userContent.css` to `@import` your autogenerated imports file:

```css
/* other css in userContent.css... */
@import url("./userstyleImports.css");
```

After restarting Firefox your userstyles should be applied as expected.

## Using with ShadowFox

The structure of the script's output is designed to be compatible
with [ShadowFox](https://github.com/overdodactyl/ShadowFox).

After executing this script, modify your
[`ShadowFox_customization/userContent_customization.css` file](https://github.com/overdodactyl/ShadowFox/wiki/Customization)
to import the autogenerated imports file instead of modifying `userContent.css` directly, then rerun the ShadowFox updater.