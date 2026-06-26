import puppeteer from 'puppeteer'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SLIDES = [1, 2, 3, 4, 5]
const WIDTH = 1270
const HEIGHT = 952
const DPR = 2  // retina — gives 2540×1904 PNG

const browser = await puppeteer.launch({ headless: 'new' })

for (const n of SLIDES) {
  const page = await browser.newPage()
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: DPR })

  const file = resolve(__dirname, `ph-slide-${n}.html`)
  await page.goto(`file://${file}`, { waitUntil: 'networkidle0', timeout: 15000 })

  // Wait for fonts to load
  await page.evaluateHandle('document.fonts.ready')

  const out = resolve(__dirname, `export/ph-slide-${n}.png`)
  await page.screenshot({ path: out, fullPage: false })

  console.log(`✓ slide ${n} → export/ph-slide-${n}.png`)
  await page.close()
}

await browser.close()
console.log('\nDone. Upload the files in marketing-assets/export/ to Product Hunt.')
