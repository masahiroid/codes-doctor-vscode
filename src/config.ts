import path from 'path';

export interface AppConfig {
  features: {
    llm: boolean;
    callGraph: boolean;
    phpAnalysis: boolean;
    mermaidDependency: boolean;
  };
  llm: {
    provider: 'openai' | 'anthropic';
    model: string;
    /** Model used for deep AST-only code review (defaults to gpt-5-4-auto-thinking for reasoning) */
    astOnlyModel: string;
    maxTokens: number;
    astOnlyMaxTokens: number;
    temperature: number;
  };
  limits: {
    maxFileSize: number;
    maxFilesPerRepo: number;
    maxClassesInReport: number;
    maxMermaidNodes: number;
  };
  paths: {
    uploads: string;
    temp: string;
    output: string;
  };
}

export const defaultConfig: AppConfig = {
  features: {
    llm: false, // LLM is disabled by default (PoC constraint)
    callGraph: true,
    phpAnalysis: true,
    mermaidDependency: true,
  },
  llm: {
    provider: 'openai',
    model: 'gpt-5.4',
    astOnlyModel: 'gpt-5.3-chat',
    maxTokens: 3000,
    astOnlyMaxTokens: 4000,
    temperature: 0.2,
  },
  limits: {
    maxFileSize: 500 * 1024 * 1024, // 500MB
    maxFilesPerRepo: 10000,
    maxClassesInReport: 50,
    maxMermaidNodes: 30,
  },
  paths: {
    uploads: path.join(process.cwd(), 'uploads'),
    temp: path.join(process.cwd(), 'temp'),
    output: path.join(process.cwd(), 'output'),
  },
};

export function getConfig(): AppConfig {
  const config: AppConfig = {
    features: { ...defaultConfig.features },
    llm: { ...defaultConfig.llm },
    limits: { ...defaultConfig.limits },
    paths: { ...defaultConfig.paths },
  };

  // Read from environment variables
  if (process.env.CSAP_LLM_ENABLED === 'true') {
    config.features.llm = true;
  }
  if (process.env.CSAP_PHP_ENABLED === 'false') {
    config.features.phpAnalysis = false;
  }
  if (process.env.CSAP_LLM_PROVIDER === 'anthropic' || process.env.CSAP_LLM_PROVIDER === 'openai') {
    config.llm.provider = process.env.CSAP_LLM_PROVIDER;
  }
  if (process.env.CSAP_LLM_MODEL) {
    config.llm.model = process.env.CSAP_LLM_MODEL;
  }
  if (process.env.CSAP_LLM_AST_MODEL) {
    config.llm.astOnlyModel = process.env.CSAP_LLM_AST_MODEL;
  }
  const maxTokens = parseInt(process.env.CSAP_LLM_MAX_TOKENS ?? '', 10);
  if (!isNaN(maxTokens)) {
    config.llm.maxTokens = maxTokens;
  }
  const astMaxTokens = parseInt(process.env.CSAP_LLM_AST_MAX_TOKENS ?? '', 10);
  if (!isNaN(astMaxTokens)) {
    config.llm.astOnlyMaxTokens = astMaxTokens;
  }
  const temperature = Number(process.env.CSAP_LLM_TEMPERATURE);
  if (process.env.CSAP_LLM_TEMPERATURE && !isNaN(temperature)) {
    config.llm.temperature = temperature;
  }
  const maxFileSize = parseInt(process.env.CSAP_MAX_FILE_SIZE ?? '', 10);
  if (!isNaN(maxFileSize)) {
    config.limits.maxFileSize = maxFileSize;
  }

  if (process.env.CSAP_OUTPUT_DIR) {
    config.paths.output = process.env.CSAP_OUTPUT_DIR;
  }
  if (process.env.CSAP_UPLOADS_DIR) {
    config.paths.uploads = process.env.CSAP_UPLOADS_DIR;
  }
  if (process.env.CSAP_TEMP_DIR) {
    config.paths.temp = process.env.CSAP_TEMP_DIR;
  }

  return config;
}
