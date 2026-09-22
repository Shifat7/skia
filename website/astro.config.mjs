// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Project Pages: https://shifat7.github.io/skia/
export default defineConfig({
	site: 'https://shifat7.github.io',
	base: '/skia',
	integrations: [
		starlight({
			title: 'Skia',
			favicon: '/favicon.svg',
			customCss: ['./src/styles/custom.css'],
			components: {
				Hero: './src/components/SplashHero.astro',
				Search: './src/components/SplashSearch.astro',
				EditLink: './src/components/SplashEditLink.astro',
				ThemeProvider: './src/components/ForceDarkTheme.astro',
				ThemeSelect: './src/components/ThemeSelect.astro',
			},
			expressiveCode: {
				themes: ['github-dark'],
			},
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/Shifat7/skia',
				},
			],
			editLink: {
				baseUrl: 'https://github.com/Shifat7/skia/edit/main/website/',
			},
			sidebar: [
				{ label: 'Status', link: '/status/' },
				{ label: 'Concepts', link: '/concepts/' },
				{ label: 'Privacy', link: '/privacy/' },
				{ label: 'Contribute', link: '/contribute/' },
			],
		}),
	],
});
