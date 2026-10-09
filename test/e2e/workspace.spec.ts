import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { execFileSync } from 'node:child_process'

let app: ElectronApplication
let page: Page
let directory: string
let data: string
let snapshotPath: string
let project: any
const shell = process.platform === 'win32' ? process.env.COMSPEC! : '/bin/sh'

async function start(): Promise<void> {
  const env = { ...process.env, IDETERM_TEST_USER_DATA: data }
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [resolve('out/main/index.js')], env })
  page = await app.firstWindow()
  await page.waitForFunction(() => !!(window as any).api)
  await expect(page.locator('.nav-rail')).toBeVisible()
}
async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

test.beforeEach(async () => {
  directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'ideterm-e2e-')))
  data = join(directory, 'user-data')
  await fs.mkdir(data)
  const folders = []
  for (const name of ['frontend', 'backend', 'infra']) {
    const path = join(directory, name)
    await fs.mkdir(path)
    execFileSync('git', ['init', '--initial-branch=main', path], { stdio: 'ignore' })
    folders.push({ id: name, name, path })
  }
  await fs.writeFile(join(folders[0].path, 'draft.txt'), 'original\n')
  project = { id: 'project', name: 'Sample project', folders, createdAt: Date.now() }
  snapshotPath = join(directory, 'workspace.ideterm-session.json')
  await fs.writeFile(
    snapshotPath,
    JSON.stringify({
      version: 1,
      name: 'Test workspace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      projects: [project],
      ui: {
        activeView: 'files',
        selectedProjectId: project.id,
        filesTarget: { path: folders[0].path, name: 'frontend' },
        openFiles: [{ path: join(folders[0].path, 'draft.txt'), name: 'draft.txt' }],
        terminals: [],
        floating: [],
        dockVisible: false,
        dockHeight: 300
      }
    })
  )
  await fs.writeFile(
    join(data, 'ideterm.json'),
    JSON.stringify({
      version: 2,
      tools: [],
      savedCommands: [],
      favCommands: [],
      recentLaunches: [],
      settings: { theme: 'dark', defaultShell: shell, terminalFontSize: 13, terminalDockVisible: false },
      snapshots: {
        dir: directory,
        recent: [snapshotPath],
        lastOpened: snapshotPath,
        restoreMode: 'last',
        cleanShutdown: true
      }
    })
  )
  await start()
})

test.afterEach(async () => {
  if (app) await app.close()
  await fs.rm(directory, { recursive: true, force: true })
})

test('unsaved text survives navigation, session switching, and app restart', async () => {
  const editor = page.locator('.cm-content')
  await expect(editor).toContainText('original')
  await editor.fill('unsaved recovery draft')
  await page.locator('.nav-rail').getByRole('button', { name: 'Projects' }).click()
  await page.locator('.nav-rail').getByRole('button', { name: 'Files' }).click()
  await expect(editor).toContainText('unsaved recovery draft')
  await expect
    .poll(
      async () =>
        JSON.parse(await fs.readFile(snapshotPath, 'utf8')).ui.editorDrafts?.[
          join(project.folders[0].path, 'draft.txt')
        ]
    )
    .toBe('unsaved recovery draft')
  expect(await fs.readFile(join(project.folders[0].path, 'draft.txt'), 'utf8')).toBe('original\n')
  const other = join(directory, 'other.ideterm-session.json')
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'))
  snapshot.name = 'Other workspace'
  snapshot.ui.editorDrafts = { [join(project.folders[0].path, 'draft.txt')]: 'another session draft' }
  await fs.writeFile(other, JSON.stringify(snapshot))
  await app.evaluate(
    ({ BrowserWindow }, path) => BrowserWindow.getAllWindows()[0].webContents.send('menu:open-path', path),
    other
  )
  await expect(page.locator('.cm-content')).toContainText('another session draft')
  await app.evaluate(
    ({ BrowserWindow }, path) => BrowserWindow.getAllWindows()[0].webContents.send('menu:open-path', path),
    snapshotPath
  )
  await expect(page.locator('.cm-content')).toContainText('unsaved recovery draft')
  await app.close()
  await start()
  await expect(page.locator('.cm-content')).toContainText('unsaved recovery draft')
  await expect(page.locator('.editor-tab .dirty')).toHaveCount(1)
})

test('selected tool mode crosses the real IPC bridge', async () => {
  const output = join(directory, 'mode.json')
  const result = await page.evaluate(
    async ({ cwd, node, output }) => {
      const api = (window as any).api
      await api.tools.save({
        id: 'test-tool',
        name: 'Test tool',
        path: node,
        type: 'ide',
        launchMode: 'external',
        folderArgPosition: 'none',
        args: ['-e', "throw new Error('default mode must not run')"],
        modes: [
          {
            id: 'review',
            label: 'Review',
            args: [
              '-e',
              `require('fs').writeFileSync(${JSON.stringify(output)}, JSON.stringify({cwd:process.cwd(), value:process.env.MODE_TEST}))`
            ]
          }
        ]
      })
      return api.launch.tool('test-tool', cwd, 'review', { MODE_TEST: 'passed' })
    },
    { cwd: project.folders[0].path, node: process.execPath, output }
  )
  expect(result.ok).toBe(true)
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await fs.readFile(output, 'utf8'))
      } catch {
        return null
      }
    })
    .toEqual({ cwd: project.folders[0].path, value: 'passed' })
})

test('a configured profile launches three repos with environment overrides and a shared layout', async () => {
  await page.locator('.nav-rail').getByRole('button', { name: 'Projects' }).click()
  await page.getByRole('button', { name: 'New launch profile' }).click()
  await page.getByLabel('Profile name', { exact: true }).fill('Develop')
  for (let index = 0; index < 3; index++) {
    if (index) await page.getByRole('button', { name: 'Add step', exact: true }).click()
    await page.getByLabel(`Step ${index + 1} name`, { exact: true }).fill(`Service ${index + 1}`)
    await page.getByLabel(`Step ${index + 1} folder`, { exact: true }).selectOption(project.folders[index].id)
    await page
      .getByLabel(`Step ${index + 1} command`, { exact: true })
      .fill(
        `"${process.execPath}" -e "require('fs').writeFileSync('profile.txt',process.cwd()+':'+process.env.PROFILE_TEST)"`
      )
    await page.locator('fieldset').nth(index).locator('summary').click()
    await page.getByLabel(`Step ${index + 1} environment`, { exact: true }).fill('PROFILE_TEST=passed')
  }
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await page.getByRole('button', { name: 'Launch Develop', exact: true }).click()
  for (const folder of project.folders) {
    await expect
      .poll(async () => {
        try {
          return await fs.readFile(join(folder.path, 'profile.txt'), 'utf8')
        } catch {
          return ''
        }
      })
      .toBe(folder.path + ':passed')
  }
  await expect(page.locator('.launch-step-result .badge')).toHaveText(['launched', 'launched', 'launched'])
  await expect(page.locator('.term-host')).toHaveCount(3)
  await expect
    .poll(async () =>
      page
        .locator('.term-host')
        .evaluateAll((els) => Math.min(...els.map((el) => el.getBoundingClientRect().width)))
    )
    .toBeGreaterThan(150)
  if (process.env.IDETERM_SCREENSHOT) {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1320, 1000))
    await page.screenshot({ path: 'test-results/project-launch.png' })
  }
  await fs.unlink(join(project.folders[0].path, 'profile.txt'))
  await page
    .locator('.launch-step-result')
    .first()
    .getByRole('button', { name: 'Restart', exact: true })
    .click()
  await expect
    .poll(async () => {
      try {
        return await fs.readFile(join(project.folders[0].path, 'profile.txt'), 'utf8')
      } catch {
        return ''
      }
    })
    .toBe(project.folders[0].path + ':passed')
  await page.getByRole('button', { name: 'Stop terminals', exact: true }).click()
  await expect.poll(() => page.evaluate(async () => (await (window as any).api.pty.list()).length)).toBe(0)
})

test('readiness waits for a local service and failed preflight launches nothing', async () => {
  const port = await freePort()
  const profile = {
    id: 'ready',
    name: 'Ready',
    steps: [
      {
        id: 'server',
        name: 'Server',
        folderId: 'backend',
        kind: 'command',
        command: `"${process.execPath}" -e "require('net').createServer().listen(${port},'127.0.0.1')"`,
        readyPort: port,
        timeoutSeconds: 10
      },
      { id: 'client', name: 'Client', folderId: 'frontend', kind: 'command', command: 'echo client-ready' }
    ]
  }
  await page.evaluate(
    async ({ project, profile }) => {
      await (window as any).api.launch.validateProfile(project, profile)
    },
    { project, profile }
  )
  const session = await page.evaluate(
    async ({ command, cwd }) => (await (window as any).api.launch.command(command, cwd, 'server')).session,
    { command: profile.steps[0].command, cwd: project.folders[1].path }
  )
  await page.evaluate(async ({ port, id }) => (window as any).api.launch.waitReady(port, 10, id), {
    port,
    id: session.id
  })
  await page.evaluate(async (id) => (window as any).api.pty.kill(id), session.id)
  const error = await page.evaluate(
    async ({ project, profile }) => {
      try {
        await (window as any).api.launch.validateProfile(project, profile)
        return ''
      } catch (error) {
        return String(error)
      }
    },
    { project, profile: { ...profile, steps: [{ ...profile.steps[0], folderId: 'missing' }] } }
  )
  expect(error).toContain('folder no longer exists')
  expect(await page.evaluate(async () => (await (window as any).api.pty.list()).length)).toBe(0)
})

test('macOS window can close and reopen with working IPC', async () => {
  test.skip(process.platform !== 'darwin')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0)
  await app.evaluate(({ app }) => app.emit('activate', {}, false))
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  page = app.windows()[0] ?? (await app.waitForEvent('window'))
  await page.waitForFunction(() => !!(window as any).api)
  const version = await page.evaluate(async () => (window as any).api.app.version())
  expect(typeof version).toBe('string')
  await expect(page.locator('.cm-content')).toContainText('original')
})

test('packaged renderer uses sandbox and rejects malformed privileged requests', async () => {
  const prefs = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
  )
  expect(prefs.sandbox).toBe(true)
  expect(prefs.nodeIntegration).toBe(false)
  const inlineRan = await page.evaluate(() => {
    const script = document.createElement('script')
    script.textContent = 'window.__inlineRan = true'
    document.body.appendChild(script)
    return (window as any).__inlineRan === true
  })
  expect(inlineRan).toBe(false)
  const error = await page.evaluate(async () => {
    try {
      await (window as any).api.app.openExternal('file:///etc/passwd')
      return ''
    } catch (error) {
      return String(error)
    }
  })
  expect(error).toContain('Only HTTP and HTTPS')
})

test('dirty file close supports cancel and discard; explicit save updates the file', async () => {
  const editor = page.locator('.cm-content')
  await editor.fill('saved source text')
  await editor.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s')
  await expect
    .poll(() => fs.readFile(join(project.folders[0].path, 'draft.txt'), 'utf8'))
    .toBe('saved source text')
  await editor.fill('draft to discard')
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 2, checkboxChecked: false })
  })
  await page.locator('.editor-tab').filter({ hasText: 'draft.txt' }).locator('.icon-btn').click()
  await expect(editor).toContainText('draft to discard')
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
  })
  await page.locator('.editor-tab').filter({ hasText: 'draft.txt' }).locator('.icon-btn').click()
  await expect(editor).toHaveCount(0)
  await expect
    .poll(
      async () =>
        Object.keys(JSON.parse(await fs.readFile(snapshotPath, 'utf8')).ui.editorDrafts ?? {}).length
    )
    .toBe(0)
  expect(await fs.readFile(join(project.folders[0].path, 'draft.txt'), 'utf8')).toBe('saved source text')
})

test('profile cancellation stops waiting terminals and skips remaining steps', async () => {
  const port = await freePort()
  const profile = {
    id: 'cancel',
    name: 'Cancel test',
    steps: [
      {
        id: 'waiting',
        name: 'Waiting service',
        folderId: 'backend',
        kind: 'command',
        command: 'echo waiting',
        readyPort: port,
        timeoutSeconds: 30
      },
      {
        id: 'later',
        name: 'Later step',
        folderId: 'frontend',
        kind: 'command',
        command: 'echo should-not-run'
      }
    ]
  }
  const nextPath = join(directory, 'profile.ideterm-session.json')
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'))
  snapshot.projects[0].launchProfiles = [profile]
  snapshot.ui.activeView = 'projects'
  await fs.writeFile(nextPath, JSON.stringify(snapshot))
  await app.evaluate(
    ({ BrowserWindow }, path) => BrowserWindow.getAllWindows()[0].webContents.send('menu:open-path', path),
    nextPath
  )
  await page.getByRole('button', { name: 'Launch Cancel test', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show terminal', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stop terminals', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Launch Cancel test', exact: true })).toBeEnabled()
  await expect(page.locator('.launch-step-result .badge')).toHaveText(['stopped', 'skipped'])
  expect(await page.evaluate(async () => (await (window as any).api.pty.list()).length)).toBe(0)
})
