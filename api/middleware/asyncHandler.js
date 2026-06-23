// Wrapper para rotas async: encaminha erros para o middleware de erro
// em vez de derrubar o processo com unhandled rejection
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
