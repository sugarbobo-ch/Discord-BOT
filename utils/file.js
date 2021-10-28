const fs = require('fs')
const https = require('https')
const path = require('path')

const imageRexExp = new RegExp('.(jpeg|jpg|gif|png|JEPG|JPG|GIF|PNG)$')

const isDirVaild = (str) => {
  const except = ['<', '>', ':', '/', '\\', '|', '?', '*', '"']
  for (const i in except) {
    if (str.includes(except[i])) { return false }
  }
  return true
}

const getParentDirectory = (filePath) => {
  const dir = path.dirname(filePath)
  console.log('dir:' + dir)
  return dir
}

const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0; var v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

const checkURL = (url) => {
  return (url.match(/\.(jpeg|jpg|gif|png|JEPG|JPG|GIF|PNG)$/) != null)
}

const isGif = (url) => {
  return (url.match(/\.(gif|GIF)$/) != null)
}

const createIndexFileInDir = (indexOfDir, files) => {
  const content = files.join('\n') + '\n'
  console.log(content)
  try {
    fs.writeFileSync(indexOfDir, content)
  } catch (err) {
    console.error(err)
  }
}

const appendIndexFile = (indexOfDir, content) => {
  console.log('appendIndexFile', indexOfDir, content)
  try {
    fs.appendFileSync(indexOfDir, content)
    return true
  } catch (error) {
    return false
  }
}

const removeFileFromIndexFile = (dir, target, indexFileName) => {
  try {
    const filePath = path.join(dir, indexFileName)
    console.log('Read: ', filePath)
    const data = fs.readFileSync(filePath, 'utf8')
    const filesList = data.split('\n')
    const index = filesList.indexOf(target)
    if (index > -1) {
      filesList.splice(index, 1)
    }
    const stream = filesList.join('\n') + '\n'
    fs.writeFileSync(filePath, stream)
  } catch (error) {
    console.error(error)
  }
}

module.exports = {
  readFileSync: (filePath) => {
    try {
      const rawdata = fs.readFileSync(filePath)
      return JSON.parse(rawdata)
    } catch (error) {
      const dir = getParentDirectory(filePath)
      if (!isDirVaild(dir)) { return {} }
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir) }
      return {}
    }
  },
  readBufferSyncFromFile: (filePath) => {
    return fs.readFileSync(filePath)
  },
  writeFileSync: (filePath, obj) => {
    try {
      const data = JSON.stringify(obj)
      fs.writeFileSync(filePath, data)
    } catch (error) {
      console.error(error)
      const dir = getParentDirectory(filePath)
      if (!isDirVaild(dir)) { return }
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir) }
      const data = JSON.stringify(obj)
      fs.writeFileSync(filePath, data)
    }
  },
  downloadFile: async (url, dest, cb) => {
    return new Promise((resolve, reject) => {
      try {
        if (!checkURL(url)) { return }
        if (!isDirVaild(dest)) { return }
        const commandName = dest
        dest = 'assets/images/' + dest + '/'
        if (!fs.existsSync(dest)) { fs.mkdirSync(dest) }
        const fileName = uuidv4()
        const fileExtension = url.match(/\.(jpeg|jpg|gif|png|JEPG|JPG|GIF|PNG)$/)[0]
        const fileDest = dest + fileName + fileExtension
        const file = fs.createWriteStream(fileDest)
        https.get(url, function (response) {
          response.pipe(file)
          file.on('finish', function () {
            file.close()
            appendIndexFile(`${dest}${commandName}`, `${fileName}${fileExtension}\n`)
            resolve(fileDest)
          })
        }).on('error', function (err) {
          fs.unlink(fileDest)
          if (cb) cb(err.message)
        })
      } catch (error) {
        console.log(error)
        reject(error)
      }
    })
  },
  getRandomFile: (type, dir) => {
    const indexOfDir = `assets/${type}/${dir}/${dir}`
    try {
      const data = fs.readFileSync(indexOfDir, 'utf8')
      if (data.length === 0) {
        throw new Error('No files list, create index')
      } else {
        const files = data.split('\n').filter(text =>
          imageRexExp.test(text) && text.length > 0
        )
        const file = files[Math.floor(Math.random() * files.length)]
        return path.join(`assets/${type}/${dir}/`, file)
      }
    } catch (error) {
      console.log(error)
      dir = 'assets/' + type + '/' + dir + '/'
      const files = fs.readdirSync(dir).filter(text =>
        imageRexExp.test(text) && text.length > 0)
      const file = files[Math.floor(Math.random() * files.length)]
      if (file === undefined) {
        return null
      } else {
        createIndexFileInDir(indexOfDir, files)
      }
      return path.join(dir, file) || null
    }
  },
  checkFileDirectoryIsExist: (dir) => {
    return fs.existsSync(dir)
  },
  removeFile: (dir, fileName, indexFileName) => {
    return new Promise((resolve, reject) => {
      fs.unlink(`${dir}/${fileName}`, (error) => {
        if (error) {
          reject(new Error('無此檔案，請確認檔案名稱與類型正確'))
        } else {
          removeFileFromIndexFile(dir, fileName, indexFileName)
          resolve()
        }
      })
    })
  },
  createIndexFileInDir,
  isGif,
  isImage: checkURL,
  appendIndexFile,
  removeFileFromIndexFile
}
