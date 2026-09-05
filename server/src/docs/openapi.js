import swaggerUi from 'swagger-ui-express';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as schemas from '../routes/schemas.js';
import { env } from '../config/env.js';

/**
 * The API reference, generated from the same zod schemas the routes validate
 * with.
 *
 * Hand-written API docs drift the moment someone adds a field and forgets the
 * yaml. Generating the request bodies from the validators means the reference
 * cannot describe a shape the server would reject — there is one definition,
 * and the docs are a view of it.
 */

const json = (schema, name) =>
  zodToJsonSchema(schema, { name, $refStrategy: 'none' }).definitions[name];

const bearer = [{ bearerAuth: [] }];

const body = (schema, name) => ({
  required: true,
  content: { 'application/json': { schema: json(schema, name) } },
});

const ok = (description) => ({ 200: { description } });

export function buildSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Keep Notes API',
      version: '2.0.0',
      description:
        'A Google Keep-style notes API with collaboration, version history, ' +
        'reminders and real-time sync. Every route below except register, ' +
        'login, refresh and the password-reset pair requires a Bearer access token.',
    },
    servers: [{ url: '/', description: 'This server' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    tags: [
      { name: 'Auth', description: 'Accounts, sessions, two-factor, password reset' },
      { name: 'Notes', description: 'The notes themselves' },
      { name: 'Collaboration', description: 'Sharing a note and who can do what' },
      { name: 'History', description: 'Versions and the activity log' },
      { name: 'Labels', description: 'Tags' },
      { name: 'Account', description: 'Notifications and export' },
    ],
    paths: {
      '/api/health': {
        get: { tags: ['Account'], summary: 'Liveness', responses: ok('The service is up') },
      },

      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Create an account',
          requestBody: body(schemas.registerSchema, 'Register'),
          responses: { 201: { description: 'Created; sets the refresh cookie' } },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Sign in',
          description:
            'Returns 401 with code `two_factor_required` when the password is ' +
            'correct but the account has two-factor enabled — the client should ' +
            'then resend with `twoFactorCode`.',
          requestBody: body(schemas.loginSchema, 'Login'),
          responses: ok('Signed in'),
        },
      },
      '/api/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Rotate the refresh token and mint an access token',
          responses: ok('A new token pair'),
        },
      },
      '/api/auth/logout': {
        post: { tags: ['Auth'], summary: 'Sign out this device', security: bearer, responses: { 204: { description: 'Signed out' } } },
      },
      '/api/auth/logout-everywhere': {
        post: { tags: ['Auth'], summary: 'Revoke every session', security: bearer, responses: ok('Revoked') },
      },
      '/api/auth/me': {
        get: { tags: ['Auth'], summary: 'The signed-in user', security: bearer, responses: ok('The user') },
      },
      '/api/auth/settings': {
        patch: {
          tags: ['Auth'],
          summary: 'Update profile and preferences',
          security: bearer,
          requestBody: body(schemas.settingsSchema, 'Settings'),
          responses: ok('The updated user'),
        },
      },
      '/api/auth/change-password': {
        post: {
          tags: ['Auth'],
          summary: 'Change the password (revokes every session)',
          security: bearer,
          requestBody: body(schemas.changePasswordSchema, 'ChangePassword'),
          responses: ok('Changed'),
        },
      },
      '/api/auth/sessions': {
        get: { tags: ['Auth'], summary: 'Active sessions', security: bearer, responses: ok('The sessions') },
      },
      '/api/auth/forgot-password': {
        post: {
          tags: ['Auth'],
          summary: 'Begin a password reset',
          description:
            'Always reports success, whether or not the address is registered — ' +
            'the reply must not be a way to enumerate accounts.',
          requestBody: body(schemas.forgotPasswordSchema, 'ForgotPassword'),
          responses: ok('Accepted'),
        },
      },
      '/api/auth/reset-password': {
        post: {
          tags: ['Auth'],
          summary: 'Finish a password reset',
          requestBody: body(schemas.resetPasswordSchema, 'ResetPassword'),
          responses: ok('Reset'),
        },
      },
      '/api/auth/2fa/setup': {
        post: {
          tags: ['Auth'],
          summary: 'Begin two-factor setup — returns a QR code',
          description: 'Two-factor is NOT enabled until /2fa/confirm succeeds.',
          security: bearer,
          responses: ok('A QR code and the secret'),
        },
      },
      '/api/auth/2fa/confirm': {
        post: {
          tags: ['Auth'],
          summary: 'Confirm setup with a code — returns the backup codes once',
          security: bearer,
          requestBody: body(schemas.twoFactorConfirmSchema, 'TwoFactorConfirm'),
          responses: ok('Enabled'),
        },
      },
      '/api/auth/2fa/disable': {
        post: {
          tags: ['Auth'],
          summary: 'Turn two-factor off (requires the password)',
          security: bearer,
          requestBody: body(schemas.twoFactorDisableSchema, 'TwoFactorDisable'),
          responses: ok('Disabled'),
        },
      },

      '/api/notes': {
        get: {
          tags: ['Notes'],
          summary: 'List notes',
          security: bearer,
          parameters: [
            { name: 'view', in: 'query', schema: { enum: ['active', 'archive', 'trash', 'shared', 'reminders'] } },
            { name: 'label', in: 'query', schema: { type: 'string' } },
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Substring search' },
            { name: 'sort', in: 'query', schema: { enum: ['updated', 'created', 'title', 'manual'] } },
            { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'From a previous nextCursor' },
            { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 100 } },
          ],
          responses: ok('A page of notes, plus nextCursor'),
        },
        post: {
          tags: ['Notes'],
          summary: 'Create a note',
          security: bearer,
          requestBody: body(schemas.createNoteSchema, 'CreateNote'),
          responses: { 201: { description: 'Created' }, 400: { description: 'An empty note is not saved' } },
        },
      },
      '/api/notes/{id}': {
        get: { tags: ['Notes'], summary: 'One note', security: bearer, responses: ok('The note') },
        patch: {
          tags: ['Notes'],
          summary: 'Edit a note',
          description:
            'Send `expectedVersion` for optimistic concurrency: a mismatch is a ' +
            '409 carrying the note as it currently stands, rather than silently ' +
            'overwriting someone else’s edit.',
          security: bearer,
          requestBody: body(schemas.updateNoteSchema, 'UpdateNote'),
          responses: { 200: { description: 'Updated' }, 409: { description: 'version_conflict' } },
        },
        delete: { tags: ['Notes'], summary: 'Delete for good, with its history', security: bearer, responses: ok('Deleted') },
      },
      '/api/notes/reorder': {
        patch: {
          tags: ['Notes'],
          summary: 'Reorder notes for the manual sort',
          security: bearer,
          requestBody: body(schemas.reorderSchema, 'Reorder'),
          responses: ok('Reordered'),
        },
      },
      '/api/notes/{id}/trash': { post: { tags: ['Notes'], summary: 'Move to the trash', security: bearer, responses: ok('Trashed') } },
      '/api/notes/{id}/restore': { post: { tags: ['Notes'], summary: 'Restore from the trash', security: bearer, responses: ok('Restored') } },
      '/api/notes/trash': { delete: { tags: ['Notes'], summary: 'Empty the trash', security: bearer, responses: ok('Emptied') } },
      '/api/notes/stats': { get: { tags: ['Notes'], summary: 'Counts, timeline and breakdowns', security: bearer, responses: ok('Stats') } },

      '/api/notes/{id}/versions': { get: { tags: ['History'], summary: 'The version history', security: bearer, responses: ok('Versions, newest first') } },
      '/api/notes/{id}/versions/{version}/restore': {
        post: {
          tags: ['History'],
          summary: 'Roll back to a version',
          description: 'Snapshots the current state first, so a restore is itself undoable.',
          security: bearer,
          responses: ok('Restored'),
        },
      },
      '/api/notes/{id}/activity': { get: { tags: ['History'], summary: 'Who changed what', security: bearer, responses: ok('Activity') } },

      '/api/notes/{id}/collaborators': {
        get: { tags: ['Collaboration'], summary: 'Who can see this note', security: bearer, responses: ok('Owner and collaborators') },
        post: {
          tags: ['Collaboration'],
          summary: 'Share with someone (owner only)',
          security: bearer,
          requestBody: body(schemas.shareSchema, 'Share'),
          responses: { 201: { description: 'Shared' }, 404: { description: 'Nobody uses that address' } },
        },
      },
      '/api/notes/{id}/collaborators/{userId}': {
        patch: {
          tags: ['Collaboration'],
          summary: 'Change a collaborator’s role (owner only)',
          security: bearer,
          requestBody: body(schemas.roleSchema, 'Role'),
          responses: ok('Updated'),
        },
        delete: { tags: ['Collaboration'], summary: 'Revoke access (owner only)', security: bearer, responses: ok('Revoked') },
      },
      '/api/notes/{id}/leave': { post: { tags: ['Collaboration'], summary: 'Leave a note shared with you', security: bearer, responses: ok('Left') } },

      '/api/notes/{id}/attachments': {
        post: {
          tags: ['Notes'],
          summary: 'Attach an image',
          description:
            'The upload is decoded and re-encoded to WebP before it is stored, ' +
            'so what lands on disk is provably an image and carries no EXIF.',
          security: bearer,
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' } } },
              },
            },
          },
          responses: { 201: { description: 'Attached' } },
        },
      },

      '/api/labels': {
        get: { tags: ['Labels'], summary: 'List labels', security: bearer, responses: ok('Labels') },
        post: {
          tags: ['Labels'],
          summary: 'Create a label',
          security: bearer,
          requestBody: body(schemas.labelSchema, 'Label'),
          responses: { 201: { description: 'Created' } },
        },
      },
      '/api/labels/{id}': {
        patch: {
          tags: ['Labels'],
          summary: 'Rename or recolour a label',
          security: bearer,
          requestBody: body(schemas.updateLabelSchema, 'UpdateLabel'),
          responses: ok('Updated'),
        },
        delete: {
          tags: ['Labels'],
          summary: 'Delete a label',
          description: 'Detaches it from its notes. The notes themselves stay.',
          security: bearer,
          responses: ok('Deleted'),
        },
      },

      '/api/notifications': {
        get: { tags: ['Account'], summary: 'Notifications and the unread count', security: bearer, responses: ok('Notifications') },
        delete: { tags: ['Account'], summary: 'Clear them all', security: bearer, responses: ok('Cleared') },
      },
      '/api/export/json': { get: { tags: ['Account'], summary: 'Download everything as JSON', security: bearer, responses: ok('A file') } },
      '/api/export/markdown': { get: { tags: ['Account'], summary: 'Download everything as Markdown', security: bearer, responses: ok('A file') } },
    },
  };
}

export function mountDocs(app) {
  // Opt-in in production. The reference is a complete map of the attack
  // surface, and forgetting an environment variable should leave it off
  // rather than on.
  if (!env.exposeDocs) return;

  const spec = buildSpec();
  app.get('/openapi.json', (_req, res) => res.json(spec));
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'Keep Notes API',
      swaggerOptions: { persistAuthorization: true, docExpansion: 'none' },
    })
  );
}
