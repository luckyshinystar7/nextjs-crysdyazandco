import { strict as assert } from 'assert';
import { NextApiResponse, NextApiRequest } from 'next';
import {
  AuthorizationParameters,
  HandleCallback as BaseHandleCallback,
  AfterCallback as BaseAfterCallback,
  HandleLogin as BaseHandleLogin
} from '../auth0-session';
import { Session } from '../session';
import { assertReqRes } from '../utils/assert';
import { BaseConfig, NextConfig } from '../config';
import { CallbackHandlerError, HandlerErrorCause } from '../utils/errors';
import { Auth0NextApiRequest, Auth0NextApiResponse, Auth0NextRequest, Auth0NextResponse } from '../http';
import { LoginOptions } from './login';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Use this function for validating additional claims on the user's ID token or adding removing items from
 * the session after login.
 *
 * @example Validate additional claims
 *
 * ```js
 * // pages/api/auth/[...auth0].js
 * import { handleAuth, handleCallback } from '@auth0/nextjs-auth0';
 *
 * const afterCallback = (req, res, session, state) => {
 *   if (session.user.isAdmin) {
 *     return session;
 *   } else {
 *     res.status(401).end('User is not admin');
 *   }
 * };
 *
 * export default handleAuth({
 *   async callback(req, res) {
 *     try {
 *       await handleCallback(req, res, { afterCallback });
 *     } catch (error) {
 *       res.status(error.status || 500).end();
 *     }
 *   }
 * });
 * ```
 *
 * @example Modify the session after login
 *
 * ```js
 * // pages/api/auth/[...auth0].js
 * import { handleAuth, handleCallback } from '@auth0/nextjs-auth0';
 *
 * const afterCallback = (req, res, session, state) => {
 *   session.user.customProperty = 'foo';
 *   delete session.refreshToken;
 *   return session;
 * };
 *
 * export default handleAuth({
 *   async callback(req, res) {
 *     try {
 *       await handleCallback(req, res, { afterCallback });
 *     } catch (error) {
 *       res.status(error.status || 500).end();
 *     }
 *   }
 * });
 * ```
 *
 * @example Redirect successful login based on claim
 *
 * ```js
 * // pages/api/auth/[...auth0].js
 * import { handleAuth, handleCallback } from '@auth0/nextjs-auth0';
 *
 * const afterCallback = (req, res, session, state) => {
 *   if (!session.user.isAdmin) {
 *     res.setHeader('Location', '/admin');
 *   }
 *   return session;
 * };
 *
 * export default handleAuth({
 *   async callback(req, res) {
 *     try {
 *       await handleCallback(req, res, { afterCallback });
 *     } catch (error) {
 *       res.status(error.status || 500).end(error.message);
 *     }
 *   }
 * });
 * ```
 *
 * @throws {@link HandlerError}
 *
 * @category Server
 */
export type AfterCallback = AfterCallbackPageRoute | AfterCallbackAppRoute;

export type AfterCallbackPageRoute = (
  req: NextApiRequest,
  res: NextApiResponse,
  session: Session,
  state?: { [key: string]: any }
) => Promise<Session | undefined> | Session | undefined;

export type AfterCallbackAppRoute = (
  req: NextRequest,
  session: Session,
  state?: { [key: string]: any }
) => Promise<Session | Response | undefined> | Session | Response | undefined;

/**
 * Options to customize the callback handler.
 *
 * @see {@link HandleCallback}
 *
 * @category Server
 */
export interface CallbackOptions {
  afterCallback?: AfterCallback;

  /**
   * This is useful to specify in addition to {@link BaseConfig.baseURL} when your app runs on multiple domains,
   * it should match {@link LoginOptions.authorizationParams.redirect_uri}.
   */
  redirectUri?: string;

  /**
   * This is useful to specify instead of {@link NextConfig.organization} when your app has multiple
   * organizations, it should match {@link LoginOptions.authorizationParams}.
   */
  organization?: string;

  /**
   * This is useful for sending custom query parameters in the body of the code exchange request
   * for use in Actions/Rules.
   */
  authorizationParams?: Partial<AuthorizationParameters>;
}

/**
 * Options provider for the default callback handler.
 * Use this to generate options that depend on values from the request.
 *
 * @category Server
 */
export type CallbackOptionsProvider = (req: NextApiRequest | NextRequest) => CallbackOptions;

/**
 * Use this to customize the default callback handler without overriding it.
 * You can still override the handler if needed.
 *
 * @example Pass an options object
 *
 * ```js
 * // pages/api/auth/[...auth0].js
 * import { handleAuth, handleCallback } from '@auth0/nextjs-auth0';
 *
 * export default handleAuth({
 *   callback: handleCallback({ redirectUri: 'https://example.com' })
 * });
 * ```
 *
 * @example Pass a function that receives the request and returns an options object
 *
 * ```js
 * // pages/api/auth/[...auth0].js
 * import { handleAuth, handleCallback } from '@auth0/nextjs-auth0';
 *
 * export default handleAuth({
 *   callback: handleCallback((req) => {
 *     return { redirectUri: 'https://example.com' };
 *   })
 * });
 * ```
 *
 * This is useful for generating options that depend on values from the request.
 *
 * @example Override the callback handler
 *
 * ```js
 * import { handleAuth, handleCallback } from '@auth0/nextjs-auth0';
 *
 * export default handleAuth({
 *   callback: async (req, res) => {
 *     try {
 *       await handleCallback(req, res, {
 *         redirectUri: 'https://example.com'
 *       });
 *     } catch (error) {
 *       console.error(error);
 *     }
 *   }
 * });
 * ```
 *
 * @category Server
 */
export type HandleCallback = {
  (req: NextApiRequest, res: NextApiResponse, options?: CallbackOptions): Promise<void>;
  (provider: CallbackOptionsProvider): CallbackHandler;
  (options: CallbackOptions): CallbackHandler;
};

/**
 * The handler for the `/api/auth/callback` API route.
 *
 * @throws {@link HandlerError}
 *
 * @category Server
 */
export type CallbackHandler = (req: NextApiRequest, res: NextApiResponse, options?: CallbackOptions) => Promise<void>;

/**
 * @ignore
 */
export default function handleCallbackFactory(handler: BaseHandleCallback, config: NextConfig): HandleCallback {
  const appRouteHandler = appRouteHandlerFactory(handler, config);
  const pageRouteHandler = pageRouteHandlerFactory(handler, config);

  return (
    reqOrOptions: NextApiRequest | CallbackOptionsProvider | CallbackOptions,
    res?: NextApiResponse,
    options?: CallbackOptions
  ): any => {
    if (typeof Request !== undefined && reqOrOptions instanceof Request) {
      return appRouteHandler(reqOrOptions as NextRequest, options);
    }
    if ('socket' in reqOrOptions && res) {
      return pageRouteHandler(reqOrOptions as NextApiRequest, res as NextApiResponse, options);
    }
    return (req: NextApiRequest | NextRequest, res: NextApiResponse) => {
      const opts = (typeof reqOrOptions === 'function' ? reqOrOptions(req) : reqOrOptions) as CallbackOptions;

      if (typeof Request !== undefined && reqOrOptions instanceof Request) {
        return appRouteHandler(req as NextRequest, opts);
      }
      return pageRouteHandler(req as NextApiRequest, res as NextApiResponse, opts);
    };
  };
}

const applyOptions = (
  req: NextApiRequest | NextRequest,
  res: NextApiResponse | undefined,
  options: CallbackOptions,
  config: NextConfig
) => {
  let opts = { ...options };
  const idTokenValidator =
    (afterCallback?: AfterCallback, organization?: string): BaseAfterCallback =>
    (session, state) => {
      if (organization) {
        assert(session.user.org_id, 'Organization Id (org_id) claim must be a string present in the ID token');
        assert.equal(
          session.user.org_id,
          organization,
          `Organization Id (org_id) claim value mismatch in the ID token; ` +
            `expected "${organization}", found "${session.user.org_id}"`
        );
      }
      if (afterCallback) {
        if (res) {
          return (afterCallback as AfterCallbackPageRoute)(req as NextApiRequest, res, session, state);
        } else {
          return (afterCallback as AfterCallbackAppRoute)(req as NextRequest, session, state);
        }
      }
      return session;
    };
  return {
    ...opts,
    afterCallback: idTokenValidator(opts.afterCallback, opts.organization || config.organization)
  };
};

const appRouteHandlerFactory: (
  handler: BaseHandleLogin,
  config: NextConfig
) => (req: NextRequest, options?: CallbackOptions) => Promise<Response> | Response =
  (handler, config) =>
  async (req, options = {}) => {
    try {
      const auth0Res = new Auth0NextResponse(new NextResponse());
      await handler(new Auth0NextRequest(req), auth0Res, applyOptions(req, undefined, options, config));
      return auth0Res.res;
    } catch (e) {
      throw new CallbackHandlerError(e as HandlerErrorCause);
    }
  };

const pageRouteHandlerFactory: (
  handler: BaseHandleCallback,
  config: NextConfig
) => (req: NextApiRequest, res: NextApiResponse, options?: CallbackOptions) => Promise<void> =
  (handler, config) =>
  async (req: NextApiRequest, res: NextApiResponse, options = {}): Promise<void> => {
    try {
      assertReqRes(req, res);
      return await handler(
        new Auth0NextApiRequest(req),
        new Auth0NextApiResponse(res),
        applyOptions(req, res, options, config)
      );
    } catch (e) {
      throw new CallbackHandlerError(e as HandlerErrorCause);
    }
  };
