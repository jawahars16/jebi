import { THEMES } from './themes'
import { FONT_OPTIONS } from './fonts'

export const DEFAULT_PREFS = {
  themeId:       'default',
  customColors:  { ...THEMES['default'].colors },
  fontFamily:    FONT_OPTIONS[0].value,
  fontSize:      15,
  promptStyleId: 'wave',
}
