// Draws the Undercover app icon: a spy's hat and dark glasses.
// 1024x1024, fully opaque (iOS rejects icons with transparency).
//
// Regenerate (compile, don't `swift app-icon.swift` — the script runner
// fails to link CoreGraphics on this toolchain):
//   swiftc -O tool/app-icon.swift -o /tmp/app-icon && /tmp/app-icon assets/icon.png
//   npx expo prebuild --platform ios --no-install
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let S: CGFloat = 1024
func rgb(_ hex: UInt32) -> CGColor {
  CGColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
          blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}

let space = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: nil, width: Int(S), height: Int(S), bitsPerComponent: 8, bytesPerRow: 0,
                    space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
// Work in top-left coordinates, like a screen.
ctx.translateBy(x: 0, y: S)
ctx.scaleBy(x: 1, y: -1)

// Background: the app's accent, lighter at the top.
let bg = CGGradient(colorsSpace: space, colors: [rgb(0x8C92F4), rgb(0x5A5FD0)] as CFArray,
                    locations: [0, 1])!
ctx.drawLinearGradient(bg, start: CGPoint(x: 0, y: 0), end: CGPoint(x: 0, y: S), options: [])

let ink = rgb(0x12131A)
ctx.setFillColor(ink)

// Hat crown: narrower at the top, rounded corners, a pinch in the middle.
let crown = CGMutablePath()
let top: CGFloat = 214, base: CGFloat = 486
crown.move(to: CGPoint(x: 300, y: base))
crown.addLine(to: CGPoint(x: 346, y: top + 70))
crown.addQuadCurve(to: CGPoint(x: 430, y: top), control: CGPoint(x: 358, y: top + 4))
crown.addQuadCurve(to: CGPoint(x: 594, y: top), control: CGPoint(x: 512, y: top + 30))
crown.addQuadCurve(to: CGPoint(x: 678, y: top + 70), control: CGPoint(x: 666, y: top + 4))
crown.addLine(to: CGPoint(x: 724, y: base))
crown.closeSubpath()
ctx.addPath(crown)
ctx.fillPath()

// Hat band, in the background colour so it reads as a stripe. Clipped to the
// crown so its ends follow the hat's sloped sides.
ctx.saveGState()
ctx.addPath(crown)
ctx.clip()
ctx.setFillColor(rgb(0x7479E6))
ctx.fill(CGRect(x: 0, y: 408, width: S, height: 48))
ctx.restoreGState()

// Brim: a wide flat ellipse.
ctx.setFillColor(ink)
ctx.fillEllipse(in: CGRect(x: 150, y: 452, width: 724, height: 104))

// Glasses: two rounded lenses and a bridge.
func lens(_ cx: CGFloat) -> CGPath {
  CGPath(roundedRect: CGRect(x: cx - 118, y: 610, width: 236, height: 168),
         cornerWidth: 76, cornerHeight: 76, transform: nil)
}
ctx.addPath(lens(372))
ctx.addPath(lens(652))
ctx.fillPath()

let bridge = CGMutablePath()
bridge.move(to: CGPoint(x: 480, y: 646))
bridge.addQuadCurve(to: CGPoint(x: 544, y: 646), control: CGPoint(x: 512, y: 618))
ctx.addPath(bridge)
ctx.setStrokeColor(ink)
ctx.setLineWidth(26)
ctx.setLineCap(.round)
ctx.strokePath()

// A glint on each lens.
ctx.setStrokeColor(rgb(0x3A3D55))
ctx.setLineWidth(22)
for cx in [372.0, 652.0] as [CGFloat] {
  ctx.move(to: CGPoint(x: cx - 66, y: 668))
  ctx.addLine(to: CGPoint(x: cx - 30, y: 638))
  ctx.strokePath()
}

let image = ctx.makeImage()!
let out = URL(fileURLWithPath: CommandLine.arguments[1])
let dest = CGImageDestinationCreateWithURL(out as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, image, nil)
guard CGImageDestinationFinalize(dest) else { fatalError("could not write \(out.path)") }
print("wrote \(out.path)")
