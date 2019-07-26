import { readdir, existsSync, readFile } from 'fs'
import { promisify } from 'util'
import { get } from 'lodash'
import path from 'path'
import { transform } from '@babel/core'
import { ActionEnvironmentSetting, ActionSettings, ActionStepSetting, ActionInputSetting } from '@fireadmin/core'
import { promiseWaterfall } from './utils/async'
import { prompt } from './utils/prompt'

const babelConfig = {	
  presets: [	
    ["@babel/preset-env", {
      "targets": {
        "node": "6"
      }
    }]
  ],
  cwd: path.join(__dirname, '..')
}	

 /**	
 * Run babel transform on a string (settings same as function babelification)	
 * @param  {String} stringToTransform - String code on which to run babel	
 * transform	
 * @return {String} Babelified string	
 */	
function runBabelTransform(stringToTransform: string) {	
  try {	
    const transformed = transform(stringToTransform, babelConfig)
    if (!transformed || !transformed.code) {
      return null
    }
    return transformed.code	
  } catch (err) {	
    console.log('Error running babel transform:', err.message || err)	
    throw err	
  }	
}

const readDirPromise = promisify(readdir)
const readFilePromise = promisify(readFile)

function getLocalActionsFolder() {
  const DEFAULT_LOCAL_ACTIONS_FOLDER = `${process.cwd()}/actions`
  if (existsSync(DEFAULT_LOCAL_ACTIONS_FOLDER)) {
    return DEFAULT_LOCAL_ACTIONS_FOLDER
  }
  const FALLBACK_LOCAL_ACTIONS_FOLDER = `${process.cwd()}/migrations`
  if (existsSync(FALLBACK_LOCAL_ACTIONS_FOLDER)) {
    return FALLBACK_LOCAL_ACTIONS_FOLDER
  }
}

async function getLocalActions(): Promise<string[]> {
  const localActionsFolder = getLocalActionsFolder()
  if (!localActionsFolder) {
    throw new Error('Local actions folder not found')
  }
  const actionFiles = await readDirPromise(localActionsFolder)
  console.log('action files:', actionFiles)
  return actionFiles
}

async function getActionSettings(actionName: string): Promise<ActionSettings> {
  const localActionsFolder = getLocalActionsFolder()
  const actionParentPath = `${localActionsFolder}/${actionName}`
  const actionSettingsPath = `${actionParentPath}/settings.json`
  const actionSettingsString: Buffer = await readFilePromise(actionSettingsPath)
  try {
    return JSON.parse(actionSettingsString.toString())
  } catch(err) {
    console.log(`Error parsing action settings for action "${actionName}"`)
    return {}
  }
}

async function requireAsync(modulePath: string) {
  const data = await readFilePromise(modulePath, { encoding: 'utf8' })
  const babelifiedString = runBabelTransform(data)
  const module = {
    exports: {}
  };
  try {
    return eval(babelifiedString || '');
  } catch(err) {
    console.log('Error evaling running code:', err)
    throw err
  }
};

export async function runCustomAction() {
  // Load actions from current folder and run it by passing in environments (selected by user based on migration settings)
  const localActions = await getLocalActions()
  const actionChoices = localActions.map((actionName) => ({
    name: actionName
  }))
  const SELECTED_ACTION_PROMPT_NAME = 'actionName'
  const optionAnswer = await prompt({}, [
    {
      type: 'list',
      name: SELECTED_ACTION_PROMPT_NAME,
      message: 'Which action would you like to run?',
      choices: actionChoices
    }
  ])
  const localActionsFolder = getLocalActionsFolder()
  const actionSettings = await getActionSettings(optionAnswer[SELECTED_ACTION_PROMPT_NAME])
  const actionParentPath = `${localActionsFolder}/${optionAnswer[SELECTED_ACTION_PROMPT_NAME]}`
  const environmentSettings: ActionEnvironmentSetting[] = get(actionSettings, 'environments', [])
  // Ask for environment preferences from Fireadmin project based on template settings
  const environmentOptions = [{ name: 'int' }, { name: 'test' }]
  const environmentQuestions: any[] = environmentSettings.map((setting: ActionEnvironmentSetting) => ({
    ...setting,
    message: `${setting.name} environment`,
    type: 'list',
    choices: environmentOptions
  }))
  const environmentsAnswers = await prompt({}, environmentQuestions)

  // Ask for input preferences from Fireadmin project based on template settings
  const inputSettings: ActionInputSetting[] = get(actionSettings, 'inputs', [])
  const inputQuestions = inputSettings.map((setting: any) => ({
    ...setting,
    message: `${setting.name} input`,
    type: 'input'
  }))
  const inputsAnswers = await prompt({}, inputQuestions)

  // Run action steps
  const actionSteps: any[] = get(actionSettings, 'steps', [])
  const actionFunctions = actionSteps.map((actionStep: ActionStepSetting) => {
    if (actionStep.type !== 'custom') {
      console.log('Only custom actions are currently suppported')
      return null
    }
    const filePath = `${actionParentPath}/${actionStep.filePath || 'index.js'}`
    if (!existsSync(filePath)) {
      console.log('File does not exist at provided path')
      return null
    }
    try {
      // Call action passing environments, inputs, and previous step results
      return async (previousStep: any) => {
        const actionContents: any = await requireAsync(filePath)
        return actionContents(environmentsAnswers, inputsAnswers, previousStep)
      }
    } catch(err) {
      console.log('Error trying to load action:', err)
      return (previousResults: any) => err
    }
  })
  const results = await promiseWaterfall(actionFunctions)
  console.log('Action completed successfully!', results) // eslint-disable-line no-console
}

export async function uploadAction() {
  // TODO: Upload custom action to fireadmin
}
