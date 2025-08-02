const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const texturesDir = './converted/textures';
const outputDir = './converted/transparent';

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function getAllPngFiles() {
    const files = fs.readdirSync(texturesDir);
    return files.filter(file => path.extname(file) === '.png');
}

function makeTransparentWithImageMagick(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
        const inputPath = path.join(texturesDir, inputFile);
        const outputPath = path.join(outputDir, outputFile);
        
        // ImageMagick command to make black pixels transparent
        // -fuzz allows for slight variations in black color
        let command;
        if (global.imageMagickPath) {
            command = `${global.imageMagickPath} "${inputPath}" -fuzz 5% -transparent black "${outputPath}"`;
        } else {
            command = `magick "${inputPath}" -fuzz 5% -transparent black "${outputPath}"`;
        }
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error processing ${inputFile}:`, error.message);
                reject(error);
            } else {
                console.log(`Processed: ${inputFile} → ${outputFile}`);
                resolve(outputPath);
            }
        });
    });
}

function makeTransparentWithFFmpeg(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
        const inputPath = path.join(texturesDir, inputFile);
        const outputPath = path.join(outputDir, outputFile);
        
        // FFmpeg command to make black pixels transparent
        const command = `ffmpeg -i "${inputPath}" -vf "colorkey=0x000000:0.1:0.1" -y "${outputPath}"`;
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error processing ${inputFile}:`, error.message);
                reject(error);
            } else {
                console.log(`Processed: ${inputFile} → ${outputFile}`);
                resolve(outputPath);
            }
        });
    });
}

async function processImages() {
    const files = getAllPngFiles();
    console.log(`\nProcessing ${files.length} images for transparency...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const file of files) {
        try {
            // Try ImageMagick first, fallback to FFmpeg
            await makeTransparentWithImageMagick(file, file);
            successCount++;
        } catch (error) {
            try {
                await makeTransparentWithFFmpeg(file, file);
                successCount++;
            } catch (ffmpegError) {
                console.error(`✗ Failed to process ${file}`);
                failCount++;
            }
        }
    }
    
    console.log(`\nDone! Processed ${successCount} images${failCount > 0 ? `, ${failCount} failed` : ''}`);
    console.log(`📁 Check the ./converted/transparent/ directory for your transparent textures.`);
}

// Check if required tools are available (same as gif creator)
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
    console.log('Descent Texture Transparency Creator');
    console.log('=======================================');
    
    if (!fs.existsSync(texturesDir)) {
        console.error(`Textures directory not found: ${texturesDir}`);
        console.log('Please run the extractor first to generate textures.');
        process.exit(1);
    }
    
    const tool = await checkDependencies();
    
    if (!tool) {
        console.error('No image processing tools found.');
        console.log('Please install ImageMagick or FFmpeg first.');
        console.log('You can use the gif creator script to install ImageMagick automatically.');
        process.exit(1);
    }
    
    console.log('Scanning for PNG files...');
    const files = getAllPngFiles();
    
    if (files.length === 0) {
        console.log('No PNG files found.');
        return;
    }
    
    console.log(`Found ${files.length} texture files to process`);
    
    await processImages();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { processImages };