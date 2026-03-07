
export const loadDirectoryStructure = async (api, dirPath) => {
  if (!dirPath) {
    throw new Error('No directory path provided');
  }
  const structureResult = await api.readDirectoryStructure(dirPath);
  if (structureResult && !structureResult.error) {
    return structureResult;
  } else {
    throw new Error(structureResult?.error || 'Failed to load directory structure');
  }
};

export const createDirectory = async (api, path) => {
  const response = await api.createDirectory(path);
  if (response?.error) {
    throw new Error(response.error);
  }
  return response;
};

export const deleteFile = async (api, path) => {
  const response = await api.deleteFile(path);
  if (response?.error) {
    throw new Error(response.error);
  }
  return response;
};

export const deleteDirectory = async (api, path) => {
  const response = await api.deleteDirectory(path);
  if (response?.error) {
    throw new Error(response.error);
  }
  return response;
};

export const renameFile = async (api, oldPath, newPath) => {
  const response = await api.renameFile(oldPath, newPath);
  if (response?.error) {
    throw new Error(response.error);
  }
  return response;
};

export const readFileContent = async (api, filePath) => {
  const response = await api.readFileContent(filePath);
  if (response.error) {
    throw new Error(response.error);
  }
  return response.content;
};

export const writeFileContent = async (api, filePath, content) => {
  const response = await api.writeFileContent(filePath, content);
  if (response.error) {
    throw new Error(response.error);
  }
  return response;
};

export const getDirectoryContentsRecursive = async (api, path) => {
  const response = await api.getDirectoryContentsRecursive(path);
  if (response.error) {
    throw new Error(response.error);
  }
  return response.files;
};

export const goUpDirectory = async (api, currentPath) => {
  return await api.goUpDirectory(currentPath);
};