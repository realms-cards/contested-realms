#!/usr/bin/env python3
"""
Card Scanner Model Training

Trains a MobileNetV2-based classifier on card images.
Exports to TensorFlow.js format for browser inference.

Usage:
  python scripts/scanner/train-model.py [options]
  
Options:
  --data-dir      Training data directory (default: data/scanner-training)
  --output-dir    Model output directory (default: public/models/card-scanner)
  --epochs        Training epochs (default: 20)
  --batch-size    Batch size (default: 32)
  --img-size      Image size (default: 224)
  --augment       Enable data augmentation (default: true)

Requirements:
  pip install tensorflow tensorflowjs pillow
"""

import os
import json
import argparse
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description='Train card scanner model')
    parser.add_argument('--data-dir', default='data/scanner-training', help='Training data directory')
    parser.add_argument('--output-dir', default='public/models/card-scanner', help='Model output directory')
    parser.add_argument('--epochs', type=int, default=40, help='Training epochs')
    parser.add_argument('--batch-size', type=int, default=32, help='Batch size')
    parser.add_argument('--img-size', type=int, default=224, help='Image size')
    parser.add_argument('--augment', type=bool, default=True, help='Enable data augmentation')
    parser.add_argument('--fine-tune', type=bool, default=True, help='Fine-tune base model')
    args = parser.parse_args()
    
    # Import TensorFlow (do this after parsing to show help faster)
    print("🔧 Loading TensorFlow...")
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers
    from tensorflow.keras.applications import MobileNetV2
    from tensorflow.keras.preprocessing.image import ImageDataGenerator
    
    print(f"TensorFlow version: {tf.__version__}")
    print(f"GPU available: {len(tf.config.list_physical_devices('GPU')) > 0}")
    
    # Paths
    data_dir = Path(args.data_dir)
    images_dir = data_dir / 'images'
    labels_path = data_dir / 'labels.json'
    output_dir = Path(args.output_dir)
    
    if not images_dir.exists():
        print(f"❌ Images directory not found: {images_dir}")
        print("Run: node scripts/scanner/prepare-training-data.js")
        return 1
    
    # Load label map
    with open(labels_path) as f:
        label_data = json.load(f)
    
    num_classes = label_data['numClasses']
    print(f"📚 {num_classes} classes to classify")
    
    # Image parameters
    IMG_SIZE = (args.img_size, args.img_size)
    BATCH_SIZE = args.batch_size
    
    # Data augmentation for training
    if args.augment:
        train_datagen = ImageDataGenerator(
            rescale=1./255,
            rotation_range=15,
            width_shift_range=0.1,
            height_shift_range=0.1,
            shear_range=0.1,
            zoom_range=0.1,
            brightness_range=[0.8, 1.2],
            horizontal_flip=False,  # Cards shouldn't be flipped
            fill_mode='nearest',
            validation_split=0.2
        )
    else:
        train_datagen = ImageDataGenerator(
            rescale=1./255,
            validation_split=0.2
        )
    
    print("📷 Loading training data...")
    
    # Use image_dataset_from_directory which supports webp
    train_ds = tf.keras.utils.image_dataset_from_directory(
        images_dir,
        validation_split=0.2,
        subset="training",
        seed=42,
        image_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        follow_links=True
    )
    
    validation_ds = tf.keras.utils.image_dataset_from_directory(
        images_dir,
        validation_split=0.2,
        subset="validation",
        seed=42,
        image_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        follow_links=True
    )
    
    # Get class names for later
    class_names = train_ds.class_names
    num_classes = len(class_names)
    print(f"Found {num_classes} classes")
    
    # Apply augmentation and normalization
    normalization_layer = tf.keras.layers.Rescaling(1./255)
    
    if args.augment:
        augmentation = tf.keras.Sequential([
            tf.keras.layers.RandomRotation(0.1),  # More rotation
            tf.keras.layers.RandomZoom(0.15),     # More zoom
            tf.keras.layers.RandomTranslation(0.15, 0.15),
            tf.keras.layers.RandomBrightness(0.3),
            tf.keras.layers.RandomContrast(0.2),  # Add contrast
        ])
        train_ds = train_ds.map(lambda x, y: (augmentation(normalization_layer(x), training=True), y))
    else:
        train_ds = train_ds.map(lambda x, y: (normalization_layer(x), y))
    
    validation_ds = validation_ds.map(lambda x, y: (normalization_layer(x), y))
    
    # Optimize dataset performance
    AUTOTUNE = tf.data.AUTOTUNE
    train_ds = train_ds.cache().prefetch(buffer_size=AUTOTUNE)
    validation_ds = validation_ds.cache().prefetch(buffer_size=AUTOTUNE)
    
    # Build model
    print("🏗️ Building model...")
    
    # Use MobileNetV2 as base (efficient for mobile/browser)
    base_model = MobileNetV2(
        input_shape=(*IMG_SIZE, 3),
        include_top=False,
        weights='imagenet',
        pooling='avg'
    )
    
    # Freeze base model initially
    base_model.trainable = False
    
    # Add classification head
    model = keras.Sequential([
        base_model,
        layers.Dropout(0.3),
        layers.Dense(512, activation='relu'),
        layers.Dropout(0.3),
        layers.Dense(num_classes, activation='softmax')
    ])
    
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy', 'sparse_top_k_categorical_accuracy']
    )
    
    model.summary()
    
    # Callbacks
    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor='val_accuracy',
            patience=5,
            restore_best_weights=True
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=3,
            min_lr=1e-6
        ),
        keras.callbacks.ModelCheckpoint(
            str(output_dir / 'checkpoint.keras'),
            monitor='val_accuracy',
            save_best_only=True
        )
    ]
    
    # Phase 1: Train head only
    print("\n🎯 Phase 1: Training classification head...")
    history1 = model.fit(
        train_ds,
        epochs=args.epochs // 2,
        validation_data=validation_ds,
        callbacks=callbacks
    )
    
    # Phase 2: Fine-tune top layers of base model
    if args.fine_tune:
        print("\n🎯 Phase 2: Fine-tuning base model...")
        base_model.trainable = True
        
        # Freeze all but the last 30 layers
        for layer in base_model.layers[:-30]:
            layer.trainable = False
        
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.0001),
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy', 'sparse_top_k_categorical_accuracy']
        )
        
        history2 = model.fit(
            train_ds,
            epochs=args.epochs // 2,
            validation_data=validation_ds,
            callbacks=callbacks
        )
    
    # Evaluate
    print("\n📊 Evaluating model...")
    results = model.evaluate(validation_ds)
    print(f"Validation Loss: {results[0]:.4f}")
    print(f"Validation Accuracy: {results[1]:.4f}")
    print(f"Top-5 Accuracy: {results[2]:.4f}")
    
    # Save Keras model (both formats for compatibility)
    output_dir.mkdir(parents=True, exist_ok=True)
    keras_path = output_dir / 'model.keras'
    h5_path = output_dir / 'model.h5'
    model.save(keras_path)
    model.save(h5_path, save_format='h5')  # Legacy format for TF.js converter
    print(f"\n💾 Saved Keras model to {keras_path}")
    print(f"💾 Saved H5 model to {h5_path}")
    
    # Save class indices mapping (using class_names from dataset)
    class_indices = {name: i for i, name in enumerate(class_names)}
    index_to_class = {i: name for i, name in enumerate(class_names)}
    
    class_map_path = output_dir / 'class_map.json'
    with open(class_map_path, 'w') as f:
        json.dump({
            'classIndices': class_indices,
            'indexToClass': index_to_class,
            'numClasses': num_classes
        }, f, indent=2)
    print(f"💾 Saved class map to {class_map_path}")
    
    # Convert to TensorFlow.js
    print("\n🔄 Converting to TensorFlow.js format...")
    try:
        import tensorflowjs as tfjs
        tfjs_path = output_dir / 'tfjs'
        tfjs.converters.save_keras_model(model, str(tfjs_path))
        print(f"✅ Saved TF.js model to {tfjs_path}")
        
        # Copy class map to tfjs folder
        import shutil
        shutil.copy(class_map_path, tfjs_path / 'class_map.json')
        
    except ImportError:
        print("⚠️ tensorflowjs not installed. Run: pip install tensorflowjs")
        print(f"Then convert manually: tensorflowjs_converter --input_format=keras {keras_path} {output_dir / 'tfjs'}")
    
    print("\n🎉 Training complete!")
    print(f"\nModel files in: {output_dir}")
    print("\nTo use in browser:")
    print("  1. Copy public/models/card-scanner/tfjs/* to your static assets")
    print("  2. Load with: await tf.loadLayersModel('/models/card-scanner/tfjs/model.json')")
    
    return 0

if __name__ == '__main__':
    exit(main())
