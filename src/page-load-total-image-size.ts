import puppeteer, {KnownDevices} from "puppeteer";
import type { Browser } from "puppeteer";
import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RANK_APPS } from './get-100-apps';
const Android = KnownDevices["Galaxy S9+"];

async function getPageImageSize(browser: Browser, url: string): Promise<{url: string, size: number, images: string[]}> {
    let size: number = 0;
    const imageUrl: string[] = [];
    const page = await browser.newPage();
    await page.emulate(Android);
    await page.setCacheEnabled(false);
    // 创建 DevTools Protocol 会话
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');
    await client.send('Fetch.enable', {
        patterns: [
            {
                urlPattern: '*',
                resourceType: 'Image',
                requestStage: 'Response'
            }
        ]
    });
    client.on('Fetch.requestPaused', async ({requestId, request, resourceType, responseHeaders}) => {
        const {body} = await client.send('Fetch.getResponseBody', {requestId});
        const resSize = Buffer.byteLength(body);
        imageUrl.push(request.url);
        // console.log('图片链接:', request.url, ', 图片大小: ', resSize);
        size += resSize;
        // @ts-ignore
        await client.send('Fetch.continueRequest', {requestId});
    });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60 * 1000 * 10 });
    console.log(imageUrl, ' 总共有:', size);
    await page.close();
    return { url: url, images: imageUrl, size };
}
(async function main() {
    const browser = await puppeteer.launch({
        headless: true,
    });

    const host = [
        'http://localhost:3000',
    ];

    const getRankListImageSize = await Promise.all(RANK_APPS.map(path => getPageImageSize(browser, host[0] + path)));
    const urlSizeStr = getRankListImageSize.reduce((previousValue, currentValue) => {
        return previousValue += `${currentValue.url.split(host[0])[1]},${currentValue.size}\r\n`;
    }, 'path,total-image\r\n');
    writeFileSync(resolve(__dirname, '../dist/outpus.csv'), urlSizeStr);
    await browser.close();
})()


async function compareUrls(browser: Browser, faster: string, slower: string): Promise<Number> {
    const [ result1, result2 ] = await Promise.all([getPageImageSize(browser, faster), getPageImageSize(browser, slower)]);
    if (result2.size - result1.size === 0) {
        return 0
    }
    return ((result2.size - result1.size) / result2.size) * 100;
}

