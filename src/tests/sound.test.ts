// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanSound } from '../lib/sound'

describe('som do lance', () => {
  it('mate, xeque, captura e lance', () => {
    expect(sanSound('Qh7#')).toBe('mate')
    expect(sanSound('Bxf7#')).toBe('mate')
    expect(sanSound('Bxf7+')).toBe('check')
    expect(sanSound('Nf3+')).toBe('check')
    expect(sanSound('exd5')).toBe('capture')
    expect(sanSound('e8=Q')).toBe('move')
    expect(sanSound('O-O')).toBe('move')
    expect(sanSound('Nf3')).toBe('move')
  })
})
