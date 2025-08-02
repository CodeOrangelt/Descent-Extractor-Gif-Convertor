const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const transparentDir = './converted/transparent';
const outputDir = './converted/transparent-gifs';

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function groupTransparentImagesByBaseName() {
    const files = fs.readdirSync(transparentDir);
    const groups = {};
    
    files.forEach(file => {
        if (path.extname(file) === '.png') {
            // Extract base name (everything before the last underscore and number)
            const match = file.match(/^(.+)_(\d+)\.png$/);
            if (match) {
                const baseName = match[1];
                const frameNumber = parseInt(match[2]);
                
                if (!groups[baseName]) {
                    groups[baseName] = [];
                }
                
                groups[baseName].push({
                    file: file,
                    frame: frameNumber,
                    path: path.join(transparentDir, file)
                });
            }
        }
    });
    
    // Sort frames and filter groups with multiple frames
    Object.keys(groups).forEach(baseName => {
        groups[baseName].sort((a, b) => a.frame - b.frame);
        if (groups[baseName].length < 2) {
            delete groups[baseName];
        }
    });
    
    return groups;
}

function createTransparentGifWithImageMagick(baseName, frames) {
    return new Promise((resolve, reject) => {
        const inputFiles = frames.map(frame => `"${frame.path}"`).join(' ');
        const outputPath = path.join(outputDir, `${baseName}.gif`);
        
        // Using ImageMagick to create animated GIF with transparency preserved
        let command;
        if (global.imageMagickPath) {
            command = `${global.imageMagickPath} -delay 20 -loop 0 -dispose previous ${inputFiles} "${outputPath}"`;
        } else {
            command = `magick -delay 20 -loop 0 -dispose previous ${inputFiles} "${outputPath}"`;
        }
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error creating transparent GIF for ${baseName}:`, error.message);
                reject(error);
            } else {
                console.log(`Created: ${baseName}.gif (${frames.length} frames with transparency)`);
                resolve(outputPath);
            }
        });
    });
}

function createTransparentGifWithFFmpeg(baseName, frames) {
    return new Promise((resolve, reject) => {
        // Create a temporary text file listing the frames
        const listFile = path.join(outputDir, `${baseName}_list.txt`);
        const listContent = frames.map(frame => `file '${path.resolve(frame.path)}'`).join('\n');
        
        fs.writeFileSync(listFile, listContent);
        
        const outputPath = path.join(outputDir, `${baseName}.gif`);
        
        // Using FFmpeg to create animated GIF with transparency
        const paletteCmd = `ffmpeg -f concat -safe 0 -i "${listFile}" -vf "fps=5,scale=320:-1:flags=lanczos,palettegen=reserve_transparent=on:transparency_color=ffffff" -y "${listFile}.palette.png"`;
        const gifCmd = `ffmpeg -f concat -safe 0 -i "${listFile}" -i "${listFile}.palette.png" -lavfi "fps=5,scale=320:-1:flags=lanczos[x];[x][1:v]paletteuse=alpha_threshold=128" -y "${outputPath}"`;
        
        exec(paletteCmd + ' && ' + gifCmd, (error, stdout, stderr) => {
            // Clean up temporary files
            try {
                fs.unlinkSync(listFile);
                fs.unlinkSync(`${listFile}.palette.png`);
            } catch (e) {}
            
            if (error) {
                console.error(`Error creating transparent GIF for ${baseName}:`, error.message);
                reject(error);
            } else {
                console.log(`Created: ${baseName}.gif (${frames.length} frames with transparency)`);
                resolve(outputPath);
            }
        });
    });
}

async function createTransparentGifs() {
    console.log('Scanning for transparent texture sequences...');
    const groups = groupTransparentImagesByBaseName();
    
    const groupNames = Object.keys(groups);
    if (groupNames.length === 0) {
        console.log('No transparent image sequences found.');
        console.log('Make sure to run transparency-maker.js first to create transparent textures.');
        return;
    }
    
    console.log(`📊 Found ${groupNames.length} transparent texture sequences:`);
    groupNames.forEach(name => {
        console.log(`  ${name}: ${groups[name].length} frames`);
    });
    
    console.log('\nCreating transparent animated GIFs...');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const baseName of groupNames) {
        try {
            // Try ImageMagick first, fallback to FFmpeg
            await createTransparentGifWithImageMagick(baseName, groups[baseName]);
            successCount++;
        } catch (error) {
            console.log(`ImageMagick failed for ${baseName}, trying FFmpeg...`);
            try {
                await createTransparentGifWithFFmpeg(baseName, groups[baseName]);
                successCount++;
            } catch (ffmpegError) {
                console.error(`Both ImageMagick and FFmpeg failed for ${baseName}`);
                failCount++;
            }
        }
    }
    
    console.log(`\nDone! Created ${successCount} transparent animated GIFs${failCount > 0 ? `, ${failCount} failed` : ''}`);
    console.log(`📁 Check the ./converted/transparent-gifs/ directory for your transparent animated textures.`);
}

// Check if required tools are available (reuse from transparency-maker)
function checkDependencies() {
    return new Promise((resolve) => {
        exec('magick -version', (error) => {
            if (!error) {
                console.log('ImageMagick detected');
                resolve('imagemagick');
                return;
            }
            
            exec('convert -version', (error) => {
                if (!error) {
                    console.log('ImageMagick detected (convert)');
                    resolve('imagemagick-convert');
                    return;
                }
                
                const magickPath = process.env.MAGICK_PATH;
                if (magickPath && fs.existsSync(magickPath)) {
                    console.log(`ImageMagick found via MAGICK_PATH: ${magickPath}`);
                    global.imageMagickPath = `"${magickPath}"`;
                    resolve('imagemagick-path');
                    return;
                }
                
                const commonPaths = [
                    'C:\\Program Files\\ImageMagick-7.1.2-Q16-HDRI\\magick.exe',
                    'C:\\Program Files\\ImageMagick-7.1.1-Q16-HDRI\\magick.exe',
                    'C:\\Program Files\\ImageMagick-7.1.0-Q16-HDRI\\magick.exe',
                    'C:\\Program Files\\ImageMagick\\magick.exe',
                    'C:\\ImageMagick\\magick.exe'
                ];
                
                let found = false;
                for (const imageMagickPath of commonPaths) {
                    if (fs.existsSync(imageMagickPath)) {
                        console.log(`ImageMagick found at: ${imageMagickPath}`);
                        global.imageMagickPath = `"${imageMagickPath}"`;
                        resolve('imagemagick-path');
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                    exec('ffmpeg -version', (error) => {
                        if (!error) {
                            console.log('FFmpeg detected');
                            resolve('ffmpeg');
                        } else {
                            console.log('No image processing tools found');
                            resolve(null);
                        }
                    });
                }
            });
        });
    });
}

async function main() {
    console.log('Descent Transparent GIF Creator');
    console.log('==================================');
    
    if (!fs.existsSync(transparentDir)) {
        console.error(`Transparent textures directory not found: ${transparentDir}`);
        console.log('Please run transparency-maker.js first to create transparent textures.');
        process.exit(1);
    }
    
    const tool = await checkDependencies();
    if (!tool) {
        console.error('No image processing tools found.');
        console.log('Please install ImageMagick or FFmpeg first.');
        console.log('ImageMagick: https://imagemagick.org/script/download.php');
        console.log('FFmpeg: https://ffmpeg.org/download.html');
        process.exit(1);
    }
    
    await createTransparentGifs();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { groupTransparentImagesByBaseName, createTransparentGifs };