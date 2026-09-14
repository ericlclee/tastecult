import { TRPCError } from '@trpc/server';
import { newPhotoPath } from '../photos';
import { profileProcedure, router } from '../trpc';

export const photoRouter = router({
  /**
   * Step one of attaching a photo: the app uploads the (already resized, JPEG) photo
   * straight to Supabase with this URL, then passes `path` to rating.create.
   */
  createUploadUrl: profileProcedure.mutation(async ({ ctx }) => {
    if (!ctx.storage) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Photo uploads are not configured on this server',
      });
    }
    const path = newPhotoPath(ctx.user.id);
    const { signedUrl, token } = await ctx.storage.createUploadUrl(path);
    return { path, signedUrl, token, publicUrl: ctx.storage.publicUrl(path) };
  }),
});
