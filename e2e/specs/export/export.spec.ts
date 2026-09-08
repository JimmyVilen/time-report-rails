import { readFile } from 'node:fs/promises'
import { test, expect } from '../../fixtures/test'
import { ExportPage } from '../../pages/ExportPage'
import { FIXED_DATE } from '../../env'
import { unique } from '../../fixtures/unique'

async function downloadCsv(
  page: import('@playwright/test').Page,
  trigger: () => Promise<void>,
) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    trigger(),
  ])
  const path = await download.path()
  return {
    filename: download.suggestedFilename(),
    content: await readFile(path, 'utf8'),
  }
}

test.describe('Export', () => {
  test('defaults both ranges to last week', async ({ page, user }) => {
    void user
    const exportPage = new ExportPage(page)
    await exportPage.goto()
    for (const name of ['Tidsrapport', 'Noteringar'] as const) {
      const section = exportPage.section(name)
      await expect(section.from).toHaveValue('2025-12-29')
      await expect(section.to).toHaveValue('2026-01-04')
    }
  })

  test('downloads time entries as CSV ordered by date and position', async ({
    page,
    user,
    api,
  }) => {
    void user
    const project = await api.createProject(unique('Projekt'))
    const tag = await api.createTag('Fakturerbar')
    const other = await api.createTag('Akut')
    const task = await api.createTask({
      title: 'Analys',
      projectId: project.id,
    })
    await api.createEntry({
      taskId: task.id,
      date: '2026-01-06',
      durationString: '2h',
      description: 'Rapport, med komma',
    })
    await api.createEntry({
      taskId: task.id,
      date: FIXED_DATE,
      startTime: '09:00',
      endTime: '10:30',
      tagIds: [other.id, tag.id],
    })
    await api.createEntry({
      taskId: task.id,
      date: FIXED_DATE,
      durationString: '15m',
      description: 'Andra raden',
    })
    await api.createEntry({
      taskId: task.id,
      date: '2026-01-13',
      durationString: '1h',
    }) // outside range

    const exportPage = new ExportPage(page)
    await exportPage.goto()
    const section = exportPage.section('Tidsrapport')
    await section.from.fill(FIXED_DATE)
    await section.to.fill('2026-01-11')
    const { filename, content } = await downloadCsv(page, () =>
      section.download.click(),
    )

    expect(filename).toBe('tidrapport_2026-01-05_2026-01-11.csv')
    expect(content).toBe(
      [
        'Datum,Projekt,Uppgift,Beskrivning,Start,Slut,Minuter,Taggar',
        // Within a day the newest entry sits at position 0.
        `2026-01-05,${project.name},Analys,Andra raden,,,15,`,
        `2026-01-05,${project.name},Analys,,09:00,10:30,90,Akut|Fakturerbar`,
        `2026-01-06,${project.name},Analys,"Rapport, med komma",,,120,`,
        '',
      ].join('\n'),
    )
  })

  test('downloads notes as CSV and an empty range yields only the header', async ({
    page,
    user,
    api,
  }) => {
    void user
    await api.upsertNote('2026-01-07', 'Notering "med citat"')
    await api.upsertNote('2026-01-05', 'Första')
    const exportPage = new ExportPage(page)
    await exportPage.goto()
    const section = exportPage.section('Noteringar')
    await section.from.fill(FIXED_DATE)
    await section.to.fill('2026-01-11')
    const notes = await downloadCsv(page, () => section.download.click())
    expect(notes.filename).toBe('anteckningar_2026-01-05_2026-01-11.csv')
    expect(notes.content).toBe(
      [
        'Datum,Notering',
        '2026-01-05,Första',
        '2026-01-07,"Notering ""med citat"""',
        '',
      ].join('\n'),
    )

    await section.from.fill('2026-03-01')
    await section.to.fill('2026-03-31')
    const empty = await downloadCsv(page, () => section.download.click())
    expect(empty.filename).toBe('anteckningar_2026-03-01_2026-03-31.csv')
    expect(empty.content).toBe('Datum,Notering\n')
  })
})
