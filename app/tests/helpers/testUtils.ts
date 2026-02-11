type ProcessHandler = (...args: unknown[]) => Promise<void> | void;

const flushPromises = async (cycles: number = 2): Promise<void> => {
  for (let i = 0; i < cycles; i += 1) {
    await Promise.resolve();
  }
};

const resolveModulePath = (metaUrl: string, relativePath: string): string => {
  return new URL(relativePath, metaUrl).pathname;
};

const mockProcessHandlersAndExit = () => {
  const handlers: Record<string, ProcessHandler> = {};
  const onSpy = jest.spyOn(process, 'on').mockImplementation(((event, handler) => {
    handlers[String(event)] = handler as ProcessHandler;
    return process;
  }) as typeof process.on);
  const exitSpy = jest
    .spyOn(process, 'exit')
    .mockImplementation(((code?: number) => undefined as never) as typeof process.exit);

  return {
    handlers,
    onSpy,
    exitSpy,
  };
};

export { flushPromises, resolveModulePath, mockProcessHandlersAndExit };
