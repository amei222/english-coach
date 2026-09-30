// Claude adapter for the static site. Bundled by esbuild into ../vendor/claude.js
// and exposed as the global `ClaudeAdapter`. The API key is the learner's own,
// entered in the app's settings and kept only in that browser's localStorage.
import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';

export type Effort = 'low' | 'medium' | 'high';

export interface TurnOptions {
  apiKey: string;
  model: string;
  system: string;
  /** Full history; earlier assistant turns must be the unchanged `content` returned by previous calls. */
  messages: Anthropic.Beta.BetaMessageParam[];
  schema: { type: 'object'; [k: string]: unknown };
  effort?: Effort;
}

export interface TurnResult {
  data: unknown;
  /** Append as `{ role: 'assistant', content }` to continue the conversation. */
  content: Anthropic.Beta.BetaContentBlock[];
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export class AdapterError extends Error {
  constructor(public zh: string, detail?: string) {
    super(detail ? `${zh}（${detail}）` : zh);
  }
}

export async function structuredTurn(o: TurnOptions): Promise<TurnResult> {
  const client = new Anthropic({ apiKey: o.apiKey, dangerouslyAllowBrowser: true, timeout: 90_000 });
  let res;
  try {
    res = await client.beta.messages.parse({
      model: o.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: o.system,
      messages: o.messages,
      output_config: { effort: o.effort ?? 'low', format: jsonSchemaOutputFormat(o.schema) },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AdapterError('API Key 无效，请到「我的 → AI 设置」检查');
    if (err instanceof Anthropic.PermissionDeniedError) throw new AdapterError('没有权限调用 Claude（当前网络所在地区可能不受支持）', err.message);
    if (err instanceof Anthropic.NotFoundError) throw new AdapterError(`找不到模型 ${o.model}，请检查模型名称`);
    if (err instanceof Anthropic.RateLimitError) throw new AdapterError('请求太频繁或额度不足，稍后再试');
    if (err instanceof Anthropic.BadRequestError) throw new AdapterError('请求被拒绝', err.message);
    if (err instanceof Anthropic.APIConnectionError) throw new AdapterError('连不上 Anthropic 服务器（需要能访问国外网络）；也可以在设置里换成 DeepSeek');
    if (err instanceof Anthropic.APIError) throw new AdapterError(`Claude 服务出错 ${err.status ?? ''}`, err.message);
    throw err;
  }
  if (res.stop_reason === 'refusal') {
    throw new AdapterError('这条内容被 Claude 拒绝了，换个说法再试试', res.stop_details?.explanation ?? undefined);
  }
  if (res.parsed_output == null) throw new AdapterError('AI 返回的格式不对，请重试');
  return {
    data: res.parsed_output,
    content: res.content,
    model: res.model,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}
