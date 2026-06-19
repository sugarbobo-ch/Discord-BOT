import fs from 'fs'
import https from 'https'
import path from 'path'

const imageRexExp = new RegExp('.(jpeg|jpg|gif|png|JEPG|JPG|GIF|PNG)$')

export const isDirValid = (str: string): boolean => {
  const except = ['<', '>', ':', '/', '\\', '|', '?', '*', '"']
  for (const char of except) {
    if (str.includes(char)) {
      return false
    }
  }
  return true
}

export const getParentDirectory = (filePath: string): string => {
  const dir = path.dirname(filePath)
  console.log('dir:' + dir)
  return dir
}

export const uuidv4 = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const getUrlPath = (urlStr: string): string => {
  try {
    const parsed = new URL(urlStr)
    return parsed.pathname
  } catch {
    return urlStr.split('?')[0].split('#')[0]
  }
}

export const checkURL = (url: string): boolean => {
  const pathname = getUrlPath(url)
  return pathname.match(/\.(jpeg|jpg|gif|png|JEPG|JPG|GIF|PNG)$/) != null
}

export const isGif = (url: string): boolean => {
  const pathname = getUrlPath(url)
  return pathname.match(/\.(gif|GIF)$/) != null
}

export const createIndexFileInDir = async (indexOfDir: string, files: string[]): Promise<void> => {
  const content = files.join('\n') + '\n'
  console.log(content)
  try {
    await fs.promises.writeFile(indexOfDir, content)
  } catch (err) {
    console.error(err)
  }
}

export const appendIndexFile = async (indexOfDir: string, content: string): Promise<boolean> => {
  console.log('appendIndexFile', indexOfDir, content)
  try {
    await fs.promises.appendFile(indexOfDir, content)
    return true
  } catch {
    return false
  }
}

export const removeFileFromIndexFile = async (
  dir: string,
  target: string,
  indexFileName: string
): Promise<void> => {
  try {
    const filePath = path.join(dir, indexFileName)
    console.log('Read: ', filePath)
    const data = await fs.promises.readFile(filePath, 'utf8')
    const filesList = data.split('\n')
    const index = filesList.indexOf(target)
    if (index > -1) {
      filesList.splice(index, 1)
    }
    const stream = filesList.join('\n') + '\n'
    await fs.promises.writeFile(filePath, stream)
  } catch (error) {
    console.error(error)
  }
}

export const readFileSync = async (filePath: string): Promise<any> => {
  try {
    const rawdata = await fs.promises.readFile(filePath, 'utf8')
    return JSON.parse(rawdata)
  } catch {
    const dir = getParentDirectory(filePath)
    if (!isDirValid(dir)) {
      return {}
    }
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true })
    }
    return {}
  }
}

export const readBufferSyncFromFile = async (filePath: string): Promise<Buffer> => {
  return fs.promises.readFile(filePath)
}

export const writeFileSync = async (filePath: string, obj: any): Promise<void> => {
  try {
    const data = JSON.stringify(obj)
    await fs.promises.writeFile(filePath, data)
  } catch (error) {
    console.error(error)
    const dir = getParentDirectory(filePath)
    if (!isDirValid(dir)) {
      return
    }
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true })
    }
    const data = JSON.stringify(obj)
    await fs.promises.writeFile(filePath, data)
  }
}

export const downloadFile = async (
  url: string,
  dest: string,
  cb?: (err: string) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      if (!checkURL(url)) {
        return reject(new Error('Invalid URL'))
      }
      if (!isDirValid(dest)) {
        return reject(new Error('Invalid destination directory'))
      }
      const commandName = dest
      const destPath = 'assets/images/' + dest + '/'
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true })
      }
      const fileName = uuidv4()
      const pathname = getUrlPath(url)
      const matchExtension = pathname.match(/\.(jpeg|jpg|gif|png|JEPG|JPG|GIF|PNG)$/)
      if (!matchExtension) {
        return reject(new Error('No valid extension found'))
      }
      const fileExtension = matchExtension[0]
      const fileDest = destPath + fileName + fileExtension
      const file = fs.createWriteStream(fileDest)
      https
        .get(url, function (response) {
          response.pipe(file as any)
          file.on('finish', async function () {
            file.close()
            await appendIndexFile(`${destPath}${commandName}`, `${fileName}${fileExtension}\n`)
            resolve(fileDest)
          })
        })
        .on('error', function (err) {
          fs.unlink(fileDest, () => {})
          if (cb) cb(err.message)
          reject(err)
        })
    } catch (error) {
      console.log(error)
      reject(error)
    }
  })
}

export const getRandomFile = async (type: string, dir: string): Promise<string | null> => {
  const indexOfDir = `assets/${type}/${dir}/${dir}`
  try {
    const data = await fs.promises.readFile(indexOfDir, 'utf8')
    if (data.length === 0) {
      throw new Error('No files list, create index')
    } else {
      const files = data.split('\n').filter(text => imageRexExp.test(text) && text.length > 0)
      const file = files[Math.floor(Math.random() * files.length)]
      return path.join(`assets/${type}/${dir}/`, file)
    }
  } catch (error) {
    console.log(error)
    const targetDir = 'assets/' + type + '/' + dir + '/'
    try {
      const files = (await fs.promises.readdir(targetDir)).filter(
        text => imageRexExp.test(text) && text.length > 0
      )
      const file = files[Math.floor(Math.random() * files.length)]
      if (file === undefined) {
        return null
      } else {
        await createIndexFileInDir(indexOfDir, files)
      }
      return path.join(targetDir, file) || null
    } catch (e) {
      console.error(e)
      return null
    }
  }
}

export const checkFileDirectoryIsExist = (dir: string): boolean => {
  return fs.existsSync(dir)
}

export const removeFile = async (
  dir: string,
  fileName: string,
  indexFileName: string
): Promise<void> => {
  try {
    await fs.promises.unlink(`${dir}/${fileName}`)
    await removeFileFromIndexFile(dir, fileName, indexFileName)
  } catch {
    throw new Error('無此檔案，請確認檔案名稱與類型正確')
  }
}

export const isImage = checkURL
