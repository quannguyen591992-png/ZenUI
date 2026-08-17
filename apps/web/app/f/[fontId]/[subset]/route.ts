import { createPublicFontHandler } from '../../../../lib/server/public-font-api'
import { createPublicFontRouteDependencies } from '../../../../lib/server/public-font-route-dependencies'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ fontId: string; subset: string }> },
) {
  return createPublicFontHandler(
    createPublicFontRouteDependencies(),
  )(request, context)
}
