[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/ASdp-pXA)
# Final Project

This is a **group assignment**.

## Step 1 - Team Formation & Data Collection

**Due: March 13**

Edit this read-me file with the first and last name of each team member, and associated GitHub username. 

Push all the data files as instructed.


## Group Members:
- Yuri Gelli,      GelinBR
- Landon Burchill, LandonB5
- Shaun Heffernan, sheff2


## Project Description

To use this project, you need the training data and training labels downloaded from Canvas. The `training_best_model.keras` file inside this repository is the final model trained on the full training dataset.

To use `train.ipynb`, run `train(...)`, which returns the final classifier and saves it to the destination provided in the arguments. You also need to provide the correct paths to the data and labels in the first two arguments of `train(...)`.

This final model version was developed from experiments in `ShaunDownsampling.ipynb`.

## Using test.ipynb
To use `test.ipynb`, run `test(...)` and provide the paths to the data, labels, and model. The model trained on the full training dataset is `training_best_model.keras`.

The function returns predicted labels, accuracy, and weighted F1 score. This test notebook can be used to evaluate both the easy "blind" test set and the hard (extra credit) test set.

## Environment Setup

These instructions assume you are using the referenced Hypergator kernel tensorflow 2.18, before running the train and test notebooks run "!pip install tensorflow_datasets tensorflow_io librosa" in a cell before the imports.

## Run Sequence

1. Open and run `train.ipynb` to train and save a model, for example:
   - `train(data="training_data_eee4773.npy", labels="training_labels_eee4773.npy", model_path="training_best_model.keras")`
2. Open and run `test.ipynb` to evaluate a saved model:
   - `test(data="training_data_eee4773.npy", labels="training_labels_eee4773.npy", model_path="training_best_model.keras")`
3. `test(...)` outputs:
   - predicted labels
   - accuracy
   - weighted F1 score

## Files for grading
- train.ipynb
- test.ipynb
- training.pdf
- test.pdf
- report.pdf
- training_best_model.keras
